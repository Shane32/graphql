import * as React from "react";
import GraphQLContext from "./GraphQLContext";
import IGraphQLDefaultOptions from "./IGraphQLDefaultOptions";

interface IGraphQLCachePolicyProps extends NonNullable<IGraphQLDefaultOptions["query"]> {
  children?: React.ReactNode;
}

/**
 * Sets default query cache options through GraphQLContext without changing the clients.
 * Explicit query options take precedence; omitted props inherit the parent defaults.
 */
const GraphQLCachePolicy = ({ fetchPolicy, cacheTime, children }: IGraphQLCachePolicyProps) => {
  const context = React.useContext(GraphQLContext);
  const value = React.useMemo(
    () => ({
      ...context,
      defaultOptions: {
        ...context?.defaultOptions,
        query: {
          ...context?.defaultOptions?.query,
          fetchPolicy: fetchPolicy ?? context?.defaultOptions?.query?.fetchPolicy,
          cacheTime: cacheTime ?? context?.defaultOptions?.query?.cacheTime,
        },
      },
    }),
    [context, fetchPolicy, cacheTime],
  );

  return <GraphQLContext.Provider value={value}>{children}</GraphQLContext.Provider>;
};

export default GraphQLCachePolicy;
