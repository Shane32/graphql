import * as React from "react";
import IGraphQLContext from "./IGraphQLContext";

/**
 * A React context that provides configured GraphQL clients and default hook options.
 *
 * @type {React.Context<IGraphQLContext>}
 */
const GraphQLContext = React.createContext<IGraphQLContext>(null as any);

export default GraphQLContext;
