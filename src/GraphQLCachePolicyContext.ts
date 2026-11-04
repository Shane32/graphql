import * as React from "react";
import IGraphQLConfiguration from "./IGraphQLConfiguration";

// An undefined policy lets each client use its own configured default.
const GraphQLCachePolicyContext = React.createContext<IGraphQLConfiguration["defaultFetchPolicy"]>(undefined);

export default GraphQLCachePolicyContext;
