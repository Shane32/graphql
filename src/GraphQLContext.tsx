import * as React from "react";
import IGraphQLContext from "./IGraphQLContext";

/**
 * A React context that provides access to one or more configured GraphQL clients.
 *
 * @type {React.Context<IGraphQLContext>}
 */
const GraphQLContext = React.createContext<IGraphQLContext>(null as any);

export default GraphQLContext;
