import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import {
  GraphQLCachePolicy,
  GraphQLClient,
  GraphQLContext,
  GraphQLDefaultOptionsContext,
  IGraphQLContext,
  IGraphQLDefaultOptions,
  useQuery,
} from "../src";

type FetchPolicy = React.ComponentProps<typeof GraphQLCachePolicy>["fetchPolicy"];

const createClient = () => {
  const client = new GraphQLClient({
    url: "https://api.example.com/graphql",
    defaultFetchPolicy: "cache-and-network",
    defaultCacheTime: 3456,
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
  options?: { client?: GraphQLClient | string; guest?: boolean; fetchPolicy?: FetchPolicy; cacheTime?: number };
}) => {
  const { data } = useQuery<{ version: string }>(`{ ${name} }`, options);
  return <span>{data?.version}</span>;
};

afterEach(() => {
  jest.restoreAllMocks();
});

it("restricts additional GraphQLContext properties to clients", () => {
  const client = createClient();
  const context: IGraphQLContext = { client, arbitraryClient: client, defaultOptions: client };
  const defaults: IGraphQLDefaultOptions = { query: { cacheTime: 1000 } };
  const invalidContext: IGraphQLContext = {
    client,
    // @ts-expect-error Default options objects cannot be assigned to additional client properties.
    arbitraryClient: defaults,
  };

  expect(context.arbitraryClient).toBe(client);
  expect(context.defaultOptions).toBe(client);
  expect(invalidContext.client).toBe(client);
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
    expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ version }" }), fetchPolicy, undefined);
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

  expect(client.executeQuery).toHaveBeenCalledWith(expect.anything(), "cache-first", undefined);
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
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ outside }" }), undefined, undefined);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ outer }" }), "no-cache", undefined);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ inner }" }), "cache-and-network", undefined);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ sibling }" }), "no-cache", undefined);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ after }" }), undefined, undefined);
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
  expect(client.executeQuery).toHaveBeenLastCalledWith(expect.objectContaining({ query: "{ inherited }" }), "cache-and-network", undefined);

  rerender(tree("cache-and-network"));
  expect(client.executeQuery).toHaveBeenCalledTimes(3);
});

it("inherits the policy for default, guest, named, and explicitly supplied clients", () => {
  const client = createClient();
  const guest = createClient();
  const alternate = createClient();
  const direct = createClient();
  render(
    <GraphQLContext.Provider value={{ client, guest, alternate }}>
      <GraphQLCachePolicy fetchPolicy="no-cache" cacheTime={1000}>
        <Query name="defaultClient" />
        <Query name="guestClient" options={{ guest: true }} />
        <Query name="namedClient" options={{ client: "alternate" }} />
        <Query name="directClient" options={{ client: direct }} />
      </GraphQLCachePolicy>
    </GraphQLContext.Provider>,
  );

  for (const selectedClient of [client, guest, alternate, direct]) {
    expect(selectedClient.executeQuery).toHaveBeenCalledTimes(1);
    expect(selectedClient.executeQuery).toHaveBeenCalledWith(expect.anything(), "no-cache", 1000);
  }
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ defaultClient }" }), "no-cache", 1000);
  expect(guest.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ guestClient }" }), "no-cache", 1000);
  expect(alternate.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ namedClient }" }), "no-cache", 1000);
  expect(direct.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ directClient }" }), "no-cache", 1000);
});

it("supports an explicitly supplied client without a parent GraphQLContext provider", () => {
  const client = createClient();
  render(
    <GraphQLCachePolicy fetchPolicy="no-cache" cacheTime={250}>
      <Query options={{ client }} />
    </GraphQLCachePolicy>,
  );

  expect(client.executeQuery).toHaveBeenCalledWith(expect.anything(), "no-cache", 250);
});

it("reads query defaults configured directly on GraphQLDefaultOptionsContext", () => {
  const client = createClient();
  render(
    <GraphQLDefaultOptionsContext.Provider value={{ query: { fetchPolicy: "no-cache", cacheTime: 1000 } }}>
      <Query options={{ client }} />
    </GraphQLDefaultOptionsContext.Provider>,
  );

  expect(client.executeQuery).toHaveBeenCalledWith(expect.anything(), "no-cache", 1000);
});

it("merges nested policy and duration overrides independently, preserving zero and parent defaults", () => {
  const client = createClient();
  const query = { fetchPolicy: "cache-and-network" as const, cacheTime: 1000 };
  const defaultOptions = { query };
  render(
    <GraphQLContext.Provider value={{ client }}>
      <GraphQLDefaultOptionsContext.Provider value={defaultOptions}>
        <Query name="root" />
        <GraphQLCachePolicy fetchPolicy="no-cache">
          <Query name="policyOnly" />
          <GraphQLCachePolicy cacheTime={0}>
            <Query name="durationOnly" />
            <GraphQLCachePolicy>
              <Query name="unchanged" />
            </GraphQLCachePolicy>
          </GraphQLCachePolicy>
          <Query name="sibling" />
        </GraphQLCachePolicy>
        <Query name="after" />
      </GraphQLDefaultOptionsContext.Provider>
    </GraphQLContext.Provider>,
  );

  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ root }" }), "cache-and-network", 1000);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ policyOnly }" }), "no-cache", 1000);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ durationOnly }" }), "no-cache", 0);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ unchanged }" }), "no-cache", 0);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ sibling }" }), "no-cache", 1000);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ after }" }), "cache-and-network", 1000);
  expect(defaultOptions.query).toBe(query);
  expect(query).toEqual({ fetchPolicy: "cache-and-network", cacheTime: 1000 });
});

it("inherits defaults across nested client providers and permits a client named defaultOptions", () => {
  const outer = createClient();
  const inner = createClient();
  const named = createClient();
  render(
    <GraphQLDefaultOptionsContext.Provider value={{ query: { fetchPolicy: "cache-first", cacheTime: 1000 } }}>
      <GraphQLContext.Provider value={{ client: outer }}>
        <Query name="before" />
        <GraphQLCachePolicy fetchPolicy="no-cache" cacheTime={500}>
          <GraphQLContext.Provider value={{ client: inner, defaultOptions: named }}>
            <Query name="innerClient" />
            <Query name="namedClient" options={{ client: "defaultOptions" }} />
          </GraphQLContext.Provider>
        </GraphQLCachePolicy>
        <Query name="after" />
      </GraphQLContext.Provider>
    </GraphQLDefaultOptionsContext.Provider>,
  );

  expect(outer.executeQuery).toHaveBeenCalledTimes(2);
  expect(outer.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ before }" }), "cache-first", 1000);
  expect(outer.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ after }" }), "cache-first", 1000);
  expect(inner.executeQuery).toHaveBeenCalledTimes(1);
  expect(inner.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ innerClient }" }), "no-cache", 500);
  expect(named.executeQuery).toHaveBeenCalledTimes(1);
  expect(named.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ namedClient }" }), "no-cache", 500);
});

it("applies explicit query overrides independently and preserves a zero cache duration", () => {
  const client = createClient();
  render(
    <GraphQLContext.Provider value={{ client }}>
      <GraphQLCachePolicy fetchPolicy="no-cache" cacheTime={1000}>
        <Query name="both" options={{ fetchPolicy: "cache-first", cacheTime: 0 }} />
        <Query name="policyOnly" options={{ fetchPolicy: "cache-first" }} />
        <Query name="durationOnly" options={{ cacheTime: 0 }} />
      </GraphQLCachePolicy>
    </GraphQLContext.Provider>,
  );

  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ both }" }), "cache-first", 0);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ policyOnly }" }), "cache-first", 1000);
  expect(client.executeQuery).toHaveBeenCalledWith(expect.objectContaining({ query: "{ durationOnly }" }), "no-cache", 0);
});

it("updates inherited durations without reexecuting queries with an unchanged explicit duration", () => {
  const client = createClient();
  const tree = (cacheTime: number) => (
    <GraphQLContext.Provider value={{ client }}>
      <GraphQLCachePolicy cacheTime={cacheTime}>
        <Query name="inherited" />
        <Query name="explicit" options={{ cacheTime: 0 }} />
      </GraphQLCachePolicy>
    </GraphQLContext.Provider>
  );
  const { rerender } = render(tree(1000));
  expect(client.executeQuery).toHaveBeenCalledTimes(2);

  rerender(tree(2000));

  expect(client.executeQuery).toHaveBeenCalledTimes(3);
  expect(client.executeQuery).toHaveBeenLastCalledWith(expect.objectContaining({ query: "{ inherited }" }), undefined, 2000);

  rerender(tree(2000));
  expect(client.executeQuery).toHaveBeenCalledTimes(3);
});

it("defers omitted policy and duration to the client defaults", () => {
  const client = createClient();
  render(
    <GraphQLContext.Provider value={{ client }}>
      <GraphQLCachePolicy>
        <Query />
      </GraphQLCachePolicy>
    </GraphQLContext.Provider>,
  );

  expect(client.executeQuery).toHaveBeenCalledWith(expect.anything(), undefined, undefined);
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

it("uses the inherited cache duration to reuse fresh results and refetch expired results", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1000000);
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { version: "old" } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { version: "fresh" } }), { status: 200 }));
  const client = new GraphQLClient({ url: "https://api.example.com/graphql", defaultCacheTime: 60000 });
  const tree = (
    <GraphQLCachePolicy cacheTime={100}>
      <Query options={{ client }} />
    </GraphQLCachePolicy>
  );
  const first = render(tree);
  await waitFor(() => expect(screen.getByText("old")).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(1);
  first.unmount();

  now.mockReturnValue(1000099);
  const second = render(tree);
  expect(screen.getByText("old")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  second.unmount();

  now.mockReturnValue(1000101);
  render(tree);
  await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(2);
});
