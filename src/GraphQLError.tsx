import IGraphQLError from "./IGraphQLError";
import IQueryResult from "./IQueryResult";

/**
 * Represents an JavaScript exception that occurs during a GraphQL query.
 */
export default class GraphQLError extends Error {
  /**
   * The GraphQL errors returned by the query, if any.
   */
  public graphQLErrors: Array<IGraphQLError> | undefined;

  /**
   * The network error returned by the query, if any.
   */
  public networkError: any;

  /**
   * The response for the query that caused the error.
   */
  public response: IQueryResult<any>;

  /**
   * Creates a new `GraphQLError` instance with the specified query response.
   *
   * @param data The response for the query that caused the error.
   */
  public constructor(data: IQueryResult<any>) {
    const message = data.errors && data.errors.length ? data.errors[0].message : "Unknown error";
    super(message);
    this.name = "GraphQLError";
    this.response = data;
    if (!data.networkError) {
      this.graphQLErrors = data.errors;
    } else {
      this.networkError = data.errors?.[0]?.extensions?.underlyingError || undefined;
    }

    // Set the prototype explicitly to maintain the correct prototype chain.
    Object.setPrototypeOf(this, GraphQLError.prototype);
    // Preserve the previous enumerable message property for JSON serialization.
    Object.defineProperty(this, "message", {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
}
