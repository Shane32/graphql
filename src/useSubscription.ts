import { useRef, useCallback, useMemo } from "react";
import GraphQLClient from "./GraphQLClient";
import IQueryResult from "./IQueryResult";
import TypedDocumentString from "./TypedDocumentString";
import useGraphQLClient from "./useGraphQLClient";
import createRequest from "./createRequest";
import ISubscriptionOptions from "./ISubscriptionOptions";
import CloseReason from "./CloseReason";

/**
 * Represents the options for the subscription function returned by useSubscription.
 *
 * @template TVariables The expected variables type of the subscription.
 */
interface ISubscriptionFunctionOptions<TResult, TVariables> {
  /** The variables to use for the subscription. */
  variables?: TVariables;
  /** The callback function to invoke when new data is received. */
  onData?: (data: IQueryResult<TResult>) => void;
  /** The callback function to invoke when the subscription is closed. */
  onClose?: (reason: CloseReason) => void;
  /** The callback function to invoke when the subscription connection is opened. */
  onOpen?: () => void;
}

/**
 * Represents the options for the useSubscription hook.
 *
 * @template TVariables The expected variables type of the subscription.
 */
interface IUseSubscriptionOptions<TResult, TVariables> extends ISubscriptionOptions {
  /** Whether to use the guest client. */
  guest?: boolean;
  /** The client to use for the subscription, or the name of the client. */
  client?: GraphQLClient | string;
  /** The variables to use for the subscription. */
  variables?: TVariables;
  /** The name of the operation to use for the subscription. */
  operationName?: string;
  /** Additional extensions to add to the subscription. */
  extensions?: {} | null;
  /** The callback function to invoke when new data is received. The latest function reference is always used. */
  onData?: (data: IQueryResult<TResult>) => void;
  /** The callback function to invoke when the subscription is closed. The latest function reference is always used. */
  onClose?: (reason: CloseReason) => void;
  /** The callback function to invoke when the subscription connection is opened. The latest function reference is always used. */
  onOpen?: () => void;
}

/**
 * Represents the `useSubscription` hook.
 */
type IUseSubscription = <TResult, TVariables = unknown>(
  query: string | TypedDocumentString<TResult, TVariables>,
  options?: IUseSubscriptionOptions<TResult, TVariables>,
) => [(functionOptions?: ISubscriptionFunctionOptions<TResult, TVariables>) => { connected: Promise<void>; abort: () => void }];

/**
 * Returns a function that executes a GraphQL subscription.
 *
 * Hook-level onData and onClose callbacks are stored in refs to ensure the latest
 * function references are always called.
 *
 * @template TResult The expected result type of the subscription.
 * @template TVariables The expected variables type of the subscription.
 * @param {string} query The GraphQL subscription string.
 * @param {IUseSubscriptionOptions<TResult, TVariables>} [options] The options for the subscription.
 * @returns {Array<Function>} A function that executes the subscription.
 *
 * @remarks
 * The returned function is stable (referentially equal across renders) when:
 * - The query, variables, operationName, and extensions when serialized have not changed
 * - The client and timeoutStrategy are stable
 */
const useSubscription: IUseSubscription = <TResult, TVariables = unknown>(
  query: string | TypedDocumentString<TResult, TVariables>,
  options?: IUseSubscriptionOptions<TResult, TVariables>,
) => {
  const client = useGraphQLClient(options && options.client, options && options.guest);

  // Store callback references in refs to always use the latest versions
  const onDataRef = useRef(options?.onData);
  const onCloseRef = useRef(options?.onClose);
  const onOpenRef = useRef(options?.onOpen);

  // Update refs when options change
  onDataRef.current = options?.onData;
  onCloseRef.current = options?.onClose;
  onOpenRef.current = options?.onOpen;

  const serializedQuery = useMemo(
    () =>
      JSON.stringify(
        createRequest(query, {
          variables: options?.variables,
          operationName: options?.operationName,
          extensions: options?.extensions,
        }),
      ),
    [query, options?.variables, options?.operationName, options?.extensions],
  );
  const timeoutStrategy = options?.timeoutStrategy;

  /**
   * Executes the subscription with the specified options.
   *
   * @param {ISubscriptionFunctionOptions<TResult, TVariables>} [functionOptions] The options for the subscription execution.
   * @returns {{ connected: Promise<void>; abort: () => void }} An object containing a promise that resolves when the subscription is connected and a function to abort the subscription.
   */
  const executeSubscription = useCallback(
    (functionOptions?: ISubscriptionFunctionOptions<TResult, TVariables>) => {
      const request = createRequest(query, {
        variables: functionOptions?.variables || options?.variables,
        operationName: options?.operationName,
        extensions: options?.extensions,
      });

      // Create combined callbacks that fire both hook-level and function-level callbacks
      const onData = (data: IQueryResult<TResult>) => {
        onDataRef.current?.(data);
        functionOptions?.onData?.(data);
      };

      const onClose = (reason: CloseReason) => {
        onCloseRef.current?.(reason);
        functionOptions?.onClose?.(reason);
      };

      const onOpen = () => {
        onOpenRef.current?.();
        functionOptions?.onOpen?.();
      };

      return client.executeSubscription<TResult, TVariables>(request, onData, onClose, { onOpen, timeoutStrategy });
    },
    [client, serializedQuery, timeoutStrategy],
  );

  return [executeSubscription];
};

export default useSubscription;
