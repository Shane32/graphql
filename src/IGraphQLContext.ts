import IGraphQLClient from "./IGraphQLClient";

/**
 * Represents a GraphQL context for a React application.
 */
interface IGraphQLContext {
  /**
   * The primary GraphQL client for the context.
   */
  client: IGraphQLClient;

  /**
   * An optional guest GraphQL client for the context.
   */
  guest?: IGraphQLClient;

  /**
   * Additional named GraphQL clients for the context.
   *
   * @key The name of the client.
   * @value The GraphQL client.
   */
  [key: string]: IGraphQLClient | undefined;
}

export default IGraphQLContext;
