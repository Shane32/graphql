import IGraphQLConfiguration from "./IGraphQLConfiguration";

/** Default options inherited by hooks through GraphQLDefaultOptionsContext. */
interface IGraphQLDefaultOptions {
  /** Default options for useQuery hooks. */
  query?: {
    /** The fetch policy to use unless a query overrides it. */
    fetchPolicy?: IGraphQLConfiguration["defaultFetchPolicy"];
    /** The cache duration in milliseconds; undefined uses the client's default. */
    cacheTime?: number;
  };
}

export default IGraphQLDefaultOptions;
