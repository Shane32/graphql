import * as React from "react";
import GraphQLCachePolicyContext from "./GraphQLCachePolicyContext";
import IGraphQLConfiguration from "./IGraphQLConfiguration";

interface IGraphQLCachePolicyProps {
  /** The default fetch policy for descendant useQuery hooks. */
  fetchPolicy: NonNullable<IGraphQLConfiguration["defaultFetchPolicy"]>;
  children?: React.ReactNode;
}

/**
 * Sets the default fetch policy for descendant useQuery hooks without changing the client.
 * An explicit query fetchPolicy takes precedence; nested providers use the nearest policy.
 */
const GraphQLCachePolicy = ({ fetchPolicy, children }: IGraphQLCachePolicyProps) => (
  <GraphQLCachePolicyContext.Provider value={fetchPolicy}>{children}</GraphQLCachePolicyContext.Provider>
);

export default GraphQLCachePolicy;
