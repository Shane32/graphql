import * as React from "react";
import GraphQLDefaultOptionsContext from "./GraphQLDefaultOptionsContext";
import IGraphQLDefaultOptions from "./IGraphQLDefaultOptions";

interface IGraphQLCachePolicyProps extends NonNullable<IGraphQLDefaultOptions["query"]> {
  children?: React.ReactNode;
}

/**
 * Sets default query cache options without changing the clients.
 * Explicit query options take precedence; omitted props inherit the parent defaults.
 */
const GraphQLCachePolicy = ({ fetchPolicy, cacheTime, children }: IGraphQLCachePolicyProps) => {
  const defaultOptions = React.useContext(GraphQLDefaultOptionsContext);
  const value = React.useMemo(
    () => ({
      ...defaultOptions,
      query: {
        ...defaultOptions.query,
        fetchPolicy: fetchPolicy ?? defaultOptions.query?.fetchPolicy,
        cacheTime: cacheTime ?? defaultOptions.query?.cacheTime,
      },
    }),
    [defaultOptions, fetchPolicy, cacheTime],
  );

  return <GraphQLDefaultOptionsContext.Provider value={value}>{children}</GraphQLDefaultOptionsContext.Provider>;
};

export default GraphQLCachePolicy;
