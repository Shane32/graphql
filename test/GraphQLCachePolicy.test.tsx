import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import { GraphQLCachePolicy, GraphQLClient, GraphQLContext, useQuery } from "../src";

type FetchPolicy = React.ComponentProps<typeof GraphQLCachePolicy>["fetchPolicy"];

const createClient = () => {
  const client = new GraphQLClient({
    url: "https://api.example.com/graphql",
    defaultFetchPolicy: "cache-and-network",
  });
  const result = { data: { version: "cached" }, networkError: false, size: 20 };
  jest.spyOn(client, "executeQuery").mockReturnValue({
    result,
    loading: false,
    resultPromise: Promise.resolve(result),
    subscribe: () => () => {},
    refresh: () => Promise.resolve(result),
    forceRefresh: () => {},
    clearAndRefresh: () => {},
  });
  return client;
};

const Query = ({
  name = "version",
  options,
}: {
  name?: string;
  options?: { client?: GraphQLClient | string; guest?: boolean; fetchPolicy?: FetchPolicy };
}) => {
  const { data } = useQuery<{ version: string }>(`{ ${name} }`, options);
  return <span>{data?.version}</span>;
};

afterEach(() => {
  jest.restoreAllMocks();
});

it.each(["cache-first", "no-cache", "cache-and-network"] as const)(
  "uses inherited %s policy for descendants without query options",
  (fetchPolicy) => {
    const client = createClient();
    render(
      <GraphQLContext.Provider value={{ client }}>
        <GraphQLCachePolicy fetchPolicy={fetchPolicy}>
          <div>
            <Query />
          </div>
        </GraphQLCachePolicy>
      </GraphQLContext.Provider>,
    );

    expect(client.executeQuery).toHaveBeenCalledTimes(1);
    expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ version }" }), fetchPolicy);
    expect(screen.getByText("cached")).toBeInTheDocument();
  },
);

it("allows an explicit query fetch policy to override the inherited default", () => {
  const client = createClient();
  render(
    <GraphQLContext.Provider value={{ client }}>
      <GraphQLCachePolicy fetchPolicy="no-cache">
        <Query options={{ fetchPolicy: "cache-first" }} />
      </GraphQLCachePolicy>
    </GraphQLContext.Provider>,
  );

  expect(client.executeQuery).toHaveBeenCalledWith(expect.anything(), "cache-first");
});

it("uses the nearest policy while preserving defaults for siblings outside its scope", () => {
  const client = createClient();
  render(
    <GraphQLContext.Provider value={{ client }}>
      <Query name="outside" />
      <GraphQLCachePolicy fetchPolicy="no-cache">
        <Query name="outer" />
        <GraphQLCachePolicy fetchPolicy="cache-and-network">
          <Query name="inner" />
        </GraphQLCachePolicy>
        <Query name="sibling" />
      </GraphQLCachePolicy>
      <Query name="after" />
    </GraphQLContext.Provider>,
  );

  expect(client.executeQuery).toHaveBeenCalledTimes(5);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ outside }" }), undefined);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ outer }" }), "no-cache");
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ inner }" }), "cache-and-network");
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ sibling }" }), "no-cache");
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ after }" }), undefined);
});

it("updates inherited policies without reexecuting queries with an unchanged explicit policy", () => {
  const client = createClient();
  const tree = (fetchPolicy: FetchPolicy) => (
    <GraphQLContext.Provider value={{ client }}>
      <GraphQLCachePolicy fetchPolicy={fetchPolicy}>
        <Query name="inherited" />
        <Query name="explicit" options={{ fetchPolicy: "cache-first" }} />
      </GraphQLCachePolicy>
    </GraphQLContext.Provider>
  );
  const { rerender } = render(tree("no-cache"));
  expect(client.executeQuery).toHaveBeenCalledTimes(2);

  rerender(tree("cache-and-network"));

  expect(client.executeQuery).toHaveBeenCalledTimes(3);
  expect(client.executeQuery).toHaveBeenLastCalledWith(expect.objectContaining({ query: "{ inherited }" }), "cache-and-network");

  rerender(tree("cache-and-network"));
  expect(client.executeQuery).toHaveBeenCalledTimes(3);
});

it("inherits the policy for default, guest, named, and explicitly supplied clients", () => {
  const client = createClient();
  const guest = createClient();
  const alternate = createClient();
  const direct = createClient();
  render(
    <GraphQLCachePolicy fetchPolicy="no-cache">
      <GraphQLContext.Provider value={{ client, guest, alternate }}>
        <Query name="defaultClient" />
        <Query name="guestClient" options={{ guest: true }} />
        <Query name="namedClient" options={{ client: "alternate" }} />
      </GraphQLContext.Provider>
      <Query name="directClient" options={{ client: direct }} />
    </GraphQLCachePolicy>,
  );

  for (const selectedClient of [client, guest, alternate, direct]) {
    expect(selectedClient.executeQuery).toHaveBeenCalledTimes(1);
    expect(selectedClient.executeQuery).toHaveBeenCalledWith(expect.anything(), "no-cache");
  }
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ defaultClient }" }), "no-cache");
  expect(guest.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ guestClient }" }), "no-cache");
  expect(alternate.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ namedClient }" }), "no-cache");
  expect(direct.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ directClient }" }), "no-cache");
});

it("bypasses a completed cached result when a query remounts under a no-cache policy", async () => {
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { version: "old" } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { version: "fresh" } }), { status: 200 }));
  const client = new GraphQLClient({ url: "https://api.example.com/graphql" });
  const first = render(<Query options={{ client }} />);
  await waitFor(() => expect(screen.getByText("old")).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(1);
  first.unmount();

  render(
    <GraphQLCachePolicy fetchPolicy="no-cache">
      <Query options={{ client }} />
    </GraphQLCachePolicy>,
  );

  await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(2);
});
