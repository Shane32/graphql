import * as React from "react";
import IGraphQLDefaultOptions from "./IGraphQLDefaultOptions";

/** A React context that provides default options for GraphQL hooks. */
const GraphQLDefaultOptionsContext = React.createContext<IGraphQLDefaultOptions>({});

export default GraphQLDefaultOptionsContext;
