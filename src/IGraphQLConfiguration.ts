import IRequest from "./IRequest";
import IGraphQLRequest from "./IGraphQLRequest";
import ISubscriptionOptions from "./ISubscriptionOptions";

/**
 * Represents configuration options for making GraphQL requests.
 */
interface IGraphQLConfiguration {
  /**
   * The URL of the GraphQL API.
   */
  url: string;

  /**
   * The URL of the WebSocket endpoint to use for subscriptions.
   */
  webSocketUrl?: string;

  /**
   * The default fetch policy to use for queries.
   */
  defaultFetchPolicy?: "cache-first" | "no-cache" | "cache-and-network";

  /**
   * The default cache time in milliseconds; defaults to 1 day.
   */
  defaultCacheTime?: number;

  /**
   * The maximum size of the cache in bytes; defaults to 20 MB.
   */
  maxCacheSize?: number;

  /**
   * A function that transforms the request before it is sent.
   *
   * @param request The original request.
   * @returns The transformed request.
   */
  transformRequest?: (request: IRequest) => IRequest | PromiseLike<IRequest>;

  /**
   * A function that generates the payload to be sent with a WebSocket connection request.
   *
   * @returns The payload.
   */
  generatePayload?: () => {} | PromiseLike<{}>;

  /**
   * Indicates whether the request should be sent as a form instead of JSON.
   */
  asForm?: boolean;

  /**
   * Indicates whether the `documentId` should be included as a query parameter
   * in the URL instead of being part of the POST body.
   */
  sendDocumentIdAsQuery?: boolean;

  /**
   * A callback function for logging non-2xx status codes.
   *
   * @param request The original request that resulted in this error.
   * @param response The HTTP response object.
   */
  logHttpError?: (request: IRequest, response: Response) => void;

  /**
   * A callback function for logging WebSocket connection failures.
   *
   * @param request The original GraphQL request that initiated the subscription.
   * @param connectionMessage The message sent to the server to initialize the connection.
   * @param receivedMessage The unexpected message that was received, if available.
   */
  logWebSocketConnectionError?: (request: IGraphQLRequest<any>, connectionMessage: any, receivedMessage: any) => void;

  /**
   * Default options for subscriptions.
   */
  defaultSubscriptionOptions?: ISubscriptionOptions;

  /**
   * Indicates whether to validate the response content type before parsing responses.
   *
   * When `true`:
   * - 2xx responses require `application/graphql-response+json` or `application/json` content type
   * - 4xx responses require `application/graphql-response+json` content type
   *
   * When `false` (default), all 2xx and 4xx responses are parsed as JSON regardless of content type.
   */
  validateResponseContentType?: boolean;
}

export default IGraphQLConfiguration;
