import * as React from "react";
import GraphQLError from "./GraphQLError";
import IGraphQLClient from "./IGraphQLClient";
import IGraphQLError from "./IGraphQLError";
import IQueryResponse from "./IQueryResponse";
import IQueryResult from "./IQueryResult";
import TypedDocumentString from "./TypedDocumentString";
import useGraphQLClient from "./useGraphQLClient";
import createRequest from "./createRequest";
import IGraphQLDefaultOptions from "./IGraphQLDefaultOptions";

/**
 * Represents the return type of the `useQuery` hook.
 *
 * @template TResult The expected result type of the query.
 */
interface IUseQueryRet<TResult> {
  /** The data returned by the query, or null if no data is available. */
  data?: TResult | null;
  /** An array of GraphQL errors returned by the query, if any. */
  errors?: Array<IGraphQLError>;
  /** A `GraphQLError` object representing any exception triggered by the query. */
  error?: GraphQLError;
  /** Additional information returned by the query. */
  extensions?: any;
  /** Whether a network error occurred while executing the query. */
  networkError?: boolean;
  /** Whether the query is currently loading. */
  loading: boolean;
  /**
   * Refetches the query unless it is already loading.
   *
   * @returns {Promise<IQueryResult<TResult>>} A promise that resolves to the result of the refetched query.
   */
  refetch: () => Promise<IQueryResult<TResult>>;
}

/**
 * Represents the options for the `useQuery` hook.
 *
 * @template TResult The expected result type of the query.
 * @template TVariables The expected variables type of the query.
 */
interface IOptions<TVariables> extends NonNullable<IGraphQLDefaultOptions["query"]> {
  /** Whether to use the guest client. */
  guest?: boolean;
  /** The client to use for the query, or the name of the client. */
  client?: IGraphQLClient | string;
  /** Whether to skip execution of the query. */
  skip?: boolean;
  /** Whether to automatically refetch the query when the query or variables change. */
  autoRefetch?: boolean;
  /** The variables to use for the query. */
  variables?: TVariables;
  /** The name of the operation to use for the query. */
  operationName?: string;
  /** Additional extensions to add to the query. */
  extensions?: {} | null;
}

/**
 * Returns the result of a GraphQL query using the specified options.
 *
 * @template TResult The expected result type of the query.
 * @template TVariables The expected variables type of the query.
 * @param {string} query The GraphQL query string.
 * @param {IOptions<TResult, TVariables>} [options] The options for the query.
 * @returns {IUseQueryRet<TResult, TVariables>} The result of the query.
 */
const useQuery: <TResult, TVariables = unknown>(
  query: string | TypedDocumentString<TResult, TVariables>,
  options?: IOptions<TVariables>,
) => IUseQueryRet<TResult> = <TResult, TVariables = unknown>(
  query: string | TypedDocumentString<TResult, TVariables>,
  options?: IOptions<TVariables>,
) => {
  const { client, defaultOptions } = useGraphQLClient(options && options.client, options && options.guest);
  const defaults = defaultOptions?.query;
  const fetchPolicy = options?.fetchPolicy ?? defaults?.fetchPolicy;
  const cacheTime = options?.cacheTime ?? defaults?.cacheTime;
  const currentVariables = options?.variables;
  const lastQueryResponseRef = React.useRef<IQueryResult<TResult> | undefined>(undefined);
  const queryRet = React.useMemo<IQueryResponse<TResult> | null>(() => {
    // any time the options change, reset any cached returned value
    lastQueryResponseRef.current = undefined;
    if (options?.skip) return null;

    const request = createRequest(query, {
      variables: currentVariables,
      operationName: options?.operationName,
      extensions: options?.extensions,
    });

    return client.executeQuery<TResult, TVariables>(request, fetchPolicy, cacheTime);
  }, [
    client,
    options?.skip,
    query,
    JSON.stringify(currentVariables || null),
    options?.operationName,
    JSON.stringify(options?.extensions || null),
    fetchPolicy,
    cacheTime,
  ]);
  const [data, setData] = React.useState(queryRet?.result || null);

  React.useEffect(() => {
    // subscribe to any updates to this query by calls to refetch
    const unsubscribe = queryRet?.subscribe((newData) => {
      setData(newData || null);
    });
    // ensure that the data is up to date (if identical instance, no redrawing will occur)
    setData(queryRet?.result || null);
    // unsubscribe when the component is dismounted
    return unsubscribe;
  }, [queryRet]);

  // prep refresh function to throw a GraphQLError if there were any query errors
  const refresh = React.useCallback(() => {
    if (!queryRet) return Promise.reject(new Error("Cannot refetch a skipped query"));
    return queryRet.refresh().then((data) => {
      if (data.data && !(data.errors && data.errors.length)) return Promise.resolve(data);
      return Promise.reject(new GraphQLError(data));
    });
  }, [queryRet]);

  const anyErrors = !!(data && data.errors && data.errors.length);
  const errorResponse = React.useMemo(() => data && new GraphQLError(data), [data]);
  if (!queryRet)
    // if skipped, return nothing
    return {
      loading: false,
      refetch: refresh,
    };
  else if (queryRet.loading && anyErrors)
    // return the query data, unless there was errors and it's reloading
    return {
      loading: true,
      refetch: refresh,
    };
  // return the response / error
  else
    return {
      ...data,
      error: anyErrors ? errorResponse! : undefined,
      loading: queryRet.loading,
      refetch: refresh,
    };
};

export default useQuery;
