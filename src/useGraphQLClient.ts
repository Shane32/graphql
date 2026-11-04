import { useContext } from "react";
import GraphQLContext from "./GraphQLContext";
import GraphQLDefaultOptionsContext from "./GraphQLDefaultOptionsContext";
import IGraphQLClient from "./IGraphQLClient";

/**
 * Returns the configured GraphQL client and default hook options from their contexts.
 *
 * @param {IGraphQLClient | string} client The name of the client to use, or the client itself.
 * @param {boolean} guest Whether to use the guest client.
 * @returns The resolved client and inherited default hook options.
 * @throws {Error} If the specified client is not found in the context.
 */
const useGraphQLClient = (client?: IGraphQLClient | string, guest?: boolean) => {
  const context = useContext(GraphQLContext);
  const defaultOptions = useContext(GraphQLDefaultOptionsContext);
  let client2 = typeof client !== "string" && client;

  // If a specific client was not provided, look it up in the context
  if (!client2) {
    // Use the client name if provided, otherwise the default or guest client as applicable
    const clientName = (typeof client === "string" && client) || (guest && "guest") || "client";
    client2 = context?.[clientName];
    if (!client2) {
      throw new Error(`Cannot find GraphQL client '${clientName}'`);
    }
  }

  return { client: client2, defaultOptions };
};

export default useGraphQLClient;
