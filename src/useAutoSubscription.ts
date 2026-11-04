import { useEffect, useState, useRef, useCallback } from "react";
import GraphQLClient from "./GraphQLClient";
import IQueryResult from "./IQueryResult";
import TypedDocumentString from "./TypedDocumentString";
import useSubscription from "./useSubscription";
import CloseReason from "./CloseReason";
import ISubscriptionOptions from "./ISubscriptionOptions";
import IReconnectionConnectionHandler from "./IReconnectionConnectionHandler";
import useGraphQLClient from "./useGraphQLClient";
import combineSubscriptionOptions from "./combineSubscriptionOptions";

/**
 * Represents the possible states of an auto-subscription.
 */
export enum AutoSubscriptionState {
  /** The subscription is not connected */
  Disconnected = "Disconnected",
  /** The subscription is in the process of connecting or reconnecting */
  Connecting = "Connecting",
  /** The subscription is connected and receiving data */
  Connected = "Connected",
  /** The subscription has failed and reconnection attempts have been exhausted */
  Error = "Error",
  /** The subscription was rejected by the server */
  Rejected = "Rejected",
  /** The subscription was completed by the server */
  Completed = "Completed",
}

/**
 * Represents the options for the useAutoSubscription hook.
 *
 * @template TResult The expected result type of the subscription.
 * @template TVariables The expected variables type of the subscription.
 */
export interface IUseAutoSubscriptionOptions<TResult, TVariables> extends ISubscriptionOptions {
  /** Whether to use the guest client. */
  guest?: boolean;
  /** The client to use for the subscription, or the name of the client. */
  client?: GraphQLClient | string;
  /**
   * The variables to use for the subscription, or a function that returns the variables.
   * Variables are evaluated each time the subscription is (re)connected.
   **/
  variables?: TVariables | (() => TVariables);
  /** The name of the operation to use for the subscription. */
  operationName?: string;
  /** Additional extensions to add to the subscription. */
  extensions?: {} | null;
  /** The callback function to invoke when new data is received. The latest function reference is always used. */
  onData?: (data: IQueryResult<TResult>) => void;
  /** The callback function to invoke when the subscription successfully connects. The latest function reference is always used. */
  onOpen?: () => void;
  /** The callback function to invoke when the subscription is closed. The latest function reference is always used. */
  onClose?: (reason: CloseReason) => void;
  /** Whether the subscription should be enabled (connected) or disabled (disconnected). Defaults to true. */
  enabled?: boolean;
}

/**
 * Represents the return value of the useAutoSubscription hook.
 */
export interface IUseAutoSubscriptionResult {
  /** The current state of the subscription. */
  state: AutoSubscriptionState;
}

const dummySubscription = { connected: Promise.resolve(), abort: () => {} };

/**
 * A hook that automatically manages a GraphQL subscription lifecycle.
 * The subscription is established when the component mounts (or when enabled becomes true)
 * and is automatically closed when the component unmounts (or when enabled becomes false).
 *
 * @template TResult The expected result type of the subscription.
 * @template TVariables The expected variables type of the subscription.
 * @param {string | TypedDocumentString<TResult, TVariables>} query The GraphQL subscription string or typed document.
 * @param {IUseAutoSubscriptionOptions<TResult, TVariables>} [options] The options for the auto-subscription.
 * @returns {IUseAutoSubscriptionResult} An object containing the current state of the subscription.
 *
 * @remarks
 * The subscription will disconnect and reconnect when any of the following change:
 * - `client`, `query`, `operationName`, `extensions`, `enabled`, `timeoutStrategy`, or `reconnectionStrategy` options
 * - `variables` when provided as an object (not as a function)
 */
const useAutoSubscription = <TResult, TVariables = unknown>(
  query: string | TypedDocumentString<TResult, TVariables>,
  options?: IUseAutoSubscriptionOptions<TResult, TVariables>,
): IUseAutoSubscriptionResult => {
  const [state, setState] = useState<AutoSubscriptionState>(AutoSubscriptionState.Disconnected);

  // Extract enabled flag, defaulting to true
  const enabled = options?.enabled !== false;

  // Store variables or variables function in a ref to always use the latest
  const variablesFnRef = useRef<(() => NonNullable<TVariables>) | undefined>(undefined);
  variablesFnRef.current =
    options?.variables && typeof options.variables === "function" ? (options.variables as () => NonNullable<TVariables>) : undefined;

  // Prepare options for useSubscription (without variables)
  const subscriptionOptions = {
    guest: options?.guest,
    client: options?.client,
    variables: options?.variables && typeof options.variables !== "function" ? options.variables : undefined,
    operationName: options?.operationName,
    extensions: options?.extensions,
    timeoutStrategy: options?.timeoutStrategy,
    onOpen: options?.onOpen,
    onData: options?.onData,
    onClose: options?.onClose,
  };

  // Use the underlying subscription hook
  const [subscribe] = useSubscription(query, subscriptionOptions);

  const client = useGraphQLClient(options && options.client, options && options.guest);
  const effectiveOptions = combineSubscriptionOptions(client.defaultSubscriptionOptions, options);
  const reconnectionStrategy = effectiveOptions.reconnectionStrategy ?? 5000; // Default to 5 second fixed delay

  useEffect(() => {
    // If disabled, return early
    if (!enabled) {
      return;
    }

    let subscription = dummySubscription;
    let reconnectionHandler: IReconnectionConnectionHandler | null = null;
    let reconnectionTimeoutId: number | null = null;

    const connect = () => {
      // Start connecting
      setState(AutoSubscriptionState.Connecting);

      // Create reconnection handler for this connection if we have a strategy
      reconnectionHandler =
        typeof reconnectionStrategy === "number"
          ? {
              onReconnectionAttempt: (reason: CloseReason) =>
                reason === CloseReason.Server || reason === CloseReason.ServerError ? -1 : reconnectionStrategy,
            }
          : reconnectionStrategy.attach();

      // Execute the subscription
      subscription = subscribe({
        variables: variablesFnRef.current?.(),
        onOpen: () => {
          setState(AutoSubscriptionState.Connected);
          // Notify reconnection handler of successful connection
          reconnectionHandler?.onConnected?.();
        },
        onClose: (reason) => {
          subscription = dummySubscription;

          // Check reconnection strategy to see if we should try to reconnect (except for Client closures)
          const decision = reason === CloseReason.Client ? -1 : (reconnectionHandler?.onReconnectionAttempt(reason) ?? 5000);
          if (decision === -1) {
            // Stop reconnecting, set Error state
            setState(AutoSubscriptionState.Error);
            reconnectionHandler?.onClose?.();
            reconnectionHandler = null;
            if (reason === CloseReason.Server) {
              setState(AutoSubscriptionState.Completed);
            } else if (reason === CloseReason.ServerError) {
              setState(AutoSubscriptionState.Rejected);
            } else if (reason === CloseReason.Client) {
              setState(AutoSubscriptionState.Disconnected);
            } else {
              setState(AutoSubscriptionState.Error);
            }
          } else if (decision === 0) {
            // Reconnect immediately
            connect();
          } else {
            // Delayed reconnection
            setState(AutoSubscriptionState.Connecting);
            reconnectionTimeoutId = window.setTimeout(() => {
              reconnectionTimeoutId = null;
              connect();
            }, decision);
          }
        },
      });

      subscription.connected.catch(() => {});
    };

    connect();

    return () => {
      // Clean up timeout if pending
      if (reconnectionTimeoutId !== null) {
        window.clearTimeout(reconnectionTimeoutId);
      }

      // Clean up reconnection handler
      reconnectionHandler?.onClose?.();

      // Abort subscription
      subscription.abort();
    };
  }, [enabled, subscribe, reconnectionStrategy]);

  return { state };
};

export default useAutoSubscription;
