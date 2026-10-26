import * as React from "react";
import { render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import GraphQLClient from "../src/GraphQLClient";
import GraphQLContext from "../src/GraphQLContext";
import useQuery from "../src/useQuery";
import { waitFor, screen } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import TypedDocumentString from "../src/TypedDocumentString";

// https://reactjs.org/docs/testing-recipes.html

interface IMockFetch {
  request: Request;
  resolve: (value: Response | Promise<Response>) => void;
  reject: (reason?: any) => void;
}
let requests: IMockFetch[] = [];

beforeEach(() => {
  jest.spyOn(global, "fetch").mockImplementation((request, init) => {
    return new Promise((resolve, reject) => {
      const fetchRequest = new Request(request, init);
      requests.push({
        request: fetchRequest,
        resolve: resolve,
        reject: reject,
      });
      const abort = () => reject(new DOMException("The operation was aborted", "AbortError"));
      if (fetchRequest.signal.aborted) abort();
      else fetchRequest.signal.addEventListener("abort", abort, { once: true });
    });
  });
});

afterEach(() => {
  requests = [];
  jest.restoreAllMocks();
});

const StrictMode = (React as any).StrictMode ?? React.Fragment;
const createRoot: ((container: Element) => { render: (children: React.ReactNode) => void; unmount: () => void }) | undefined =
  parseInt(React.version, 10) >= 18 ? require("react-dom/client").createRoot : undefined;
const concurrentTest = createRoot ? it : it.skip;

const useQueryTest = async (useStrictMode: boolean, count: number, fetchPolicy: "no-cache" | "cache-first" | "cache-and-network") => {
  act(() => {
    const client = new GraphQLClient({
      url: "https://api.example.com/api/graphql",
      asForm: true,
    });
    if (useStrictMode) {
      render(
        <StrictMode>
          <GraphQLContext.Provider value={{ client }}>
            <TestUseQuery />
          </GraphQLContext.Provider>
        </StrictMode>,
      );
    } else {
      render(
        <GraphQLContext.Provider value={{ client }}>
          <TestUseQuery />
        </GraphQLContext.Provider>,
      );
    }
  });
  await waitFor(() => expect(screen.getByText("Loading")).toBeInTheDocument());
  await waitFor(() => expect(requests.length).toEqual(count));
  for (let i = 0; i < count; i++) {
    expect(requests[i].request.url).toEqual("https://api.example.com/api/graphql");
    expect(requests[i].request.method).toEqual("POST");
    const formData = await requests[i].request.formData();
    expect(formData.get("query")).toEqual("{ v1 { info { version } } }");
    requests[i].resolve(
      new Response(
        JSON.stringify({
          data: {
            v1: {
              info: {
                version: "12345",
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }
  await waitFor(() => expect(screen.getByText("Version: 12345")).toBeInTheDocument());

  function TestUseQuery() {
    const result = useQuery<{ v1: { info: { version: string } } }>("{ v1 { info { version } } }", { fetchPolicy: fetchPolicy });
    return result.data ? <p>Version: {result.data.v1.info.version}</p> : <p>Loading</p>;
  }
};

it("useQuery works", () => useQueryTest(false, 1, "no-cache"));

it("useQuery cancels a pending no-cache request when unmounted", async () => {
  const client = new GraphQLClient({ url: "https://api.example.com/api/graphql" });

  function TestUseQuery() {
    const result = useQuery<{ version: string }>("{ version }", { client, fetchPolicy: "no-cache" });
    return <p>{result.loading ? "Loading" : result.data?.version}</p>;
  }

  const { unmount } = render(<TestUseQuery />);

  await waitFor(() => expect(requests).toHaveLength(1));
  expect(screen.getByText("Loading")).toBeInTheDocument();
  expect(requests[0].request.signal.aborted).toBe(false);
  expect(client.getPendingRequests()).toBe(1);

  // Unmount without resolving the pending request.
  unmount();

  await waitFor(() => expect(requests[0].request.signal.aborted).toBe(true));
  await waitFor(() => expect(client.getPendingRequests()).toBe(0));
  expect(requests).toHaveLength(1);
});

concurrentTest("useQuery shares a pending no-cache request when sibling passive effects are deferred", async () => {
  const client = new GraphQLClient({ url: "https://api.example.com/api/graphql" });
  const mounted = jest.fn();
  const unmounted = jest.fn();
  const initialTime = performance.now();
  let elapsed = 0;
  const now = jest.spyOn(performance, "now").mockImplementation(() => initialTime + elapsed);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot!(container);
  const actEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

  function TestUseQuery() {
    const result = useQuery<{ version: string }>("{ version }", { client, fetchPolicy: "no-cache" });
    React.useEffect(() => {
      mounted();
      return () => {
        unmounted();
      };
    }, []);
    return <p>{result.loading ? "Loading" : result.data?.version}</p>;
  }

  function DeferPassiveEffects() {
    React.useLayoutEffect(() => {
      // Exhaust React's time slice so passive subscriptions run in a later task.
      elapsed = 50;
    }, []);
    return null;
  }

  try {
    // Render outside act(), which would flush the passive subscriptions synchronously.
    root.render(
      <>
        <TestUseQuery key="first" />
        <TestUseQuery key="second" />
        <DeferPassiveEffects key="defer" />
      </>,
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => expect(mounted).toHaveBeenCalledTimes(2));
    expect(requests[0].request.signal.aborted).toBe(false);
    expect(screen.getAllByText("Loading")).toHaveLength(2);
    expect(client.getPendingRequests()).toBe(1);

    root.render(
      <>
        <TestUseQuery key="second" />
        <DeferPassiveEffects key="defer" />
      </>,
    );

    await waitFor(() => expect(unmounted).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText("Loading")).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.signal.aborted).toBe(false);
    expect(client.getPendingRequests()).toBe(1);

    root.unmount();

    await waitFor(() => expect(requests[0].request.signal.aborted).toBe(true));
    await waitFor(() => expect(client.getPendingRequests()).toBe(0));
    expect(requests).toHaveLength(1);
  } finally {
    root.unmount();
    container.remove();
    now.mockRestore();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  }
});

it.each(["pending", "completed"] as const)(
  "useQuery sends a fresh no-cache request after unmounting a %s request",
  async (requestState) => {
    const client = new GraphQLClient({ url: "https://api.example.com/api/graphql" });

    function TestUseQuery() {
      const result = useQuery<{ version: string }>("{ version }", { client, fetchPolicy: "no-cache" });
      return <p>{result.loading ? "Loading" : result.data?.version}</p>;
    }

    const { unmount } = render(<TestUseQuery />);
    await waitFor(() => expect(requests).toHaveLength(1));

    if (requestState === "completed") {
      requests[0].resolve(new Response(JSON.stringify({ data: { version: "old" } }), { status: 200 }));
      await waitFor(() => expect(screen.getByText("old")).toBeInTheDocument());
    } else {
      // Remount during abort, before the cancelled request's result promise settles.
      requests[0].request.signal.addEventListener("abort", () => render(<TestUseQuery />), { once: true });
    }

    unmount();
    if (requestState === "completed") render(<TestUseQuery />);

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].request.signal.aborted).toBe(requestState === "pending");
    expect(requests[1].request.signal.aborted).toBe(false);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    await waitFor(() => expect(client.getPendingRequests()).toBe(1));

    requests[1].resolve(new Response(JSON.stringify({ data: { version: "fresh" } }), { status: 200 }));
    await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());
    expect(requests).toHaveLength(2);
    expect(client.getPendingRequests()).toBe(0);
  },
);

it("useQuery works with strict mode", () => useQueryTest(true, 1, "no-cache"));
it("useQuery works with strict mode, cache-first", () => useQueryTest(true, 1, "cache-first"));
it("useQuery works with strict mode, cache-and-network", () => useQueryTest(true, 1, "cache-and-network"));

it.each(["no-cache", "cache-first", "cache-and-network"] as const)(
  "useQuery shares one pending request in strict mode with %s",
  async (fetchPolicy) => {
    const client = new GraphQLClient({ url: "https://api.example.com/api/graphql" });

    function TestUseQuery() {
      const result = useQuery<{ version: string }>("{ version }", { client, fetchPolicy });
      return <p>{result.loading ? "Loading" : result.data?.version}</p>;
    }

    render(
      <StrictMode>
        <TestUseQuery />
      </StrictMode>,
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(requests[0].request.signal.aborted).toBe(false);
    await waitFor(() => expect(client.getPendingRequests()).toBe(1));

    // Keep the response pending until Strict Mode has finished replaying the effects.
    requests[0].resolve(
      new Response(JSON.stringify({ data: { version: "12345" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(screen.getByText("12345")).toBeInTheDocument());
    expect(requests).toHaveLength(1);
    expect(client.getPendingRequests()).toBe(0);
  },
);

const useQueryWithHashTest = async (
  useStrictMode: boolean,
  count: number,
  fetchPolicy: "no-cache" | "cache-first" | "cache-and-network",
  hashInUrl: boolean,
) => {
  act(() => {
    const client = new GraphQLClient({
      url: "https://api.example.com/api/graphql",
      asForm: true,
      sendDocumentIdAsQuery: hashInUrl,
    });
    if (useStrictMode) {
      render(
        <StrictMode>
          <GraphQLContext.Provider value={{ client }}>
            <TestUseQuery />
          </GraphQLContext.Provider>
        </StrictMode>,
      );
    } else {
      render(
        <GraphQLContext.Provider value={{ client }}>
          <TestUseQuery />
        </GraphQLContext.Provider>,
      );
    }
  });
  await waitFor(() => expect(screen.getByText("Loading")).toBeInTheDocument());
  await waitFor(() => expect(requests.length).toEqual(count));
  for (let i = 0; i < count; i++) {
    expect(requests[i].request.url).toEqual(
      hashInUrl ? "https://api.example.com/api/graphql?documentId=myhash" : "https://api.example.com/api/graphql",
    );
    expect(requests[i].request.method).toEqual("POST");
    const formData = await requests[i].request.formData();
    expect(formData.get("query")).toBeNull();
    if (hashInUrl) {
      expect(formData.get("documentId")).toBeNull();
    } else {
      expect(formData.get("documentId")).toEqual("myhash");
    }
    requests[i].resolve(
      new Response(
        JSON.stringify({
          data: {
            v1: {
              info: {
                version: "12345",
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }
  await waitFor(() => expect(screen.getByText("Version: 12345")).toBeInTheDocument());

  function TestUseQuery() {
    const document = { __meta__: { hash: "myhash" } } as TypedDocumentString<{ v1: { info: { version: string } } }, {}>;
    const result = useQuery(document, { fetchPolicy: fetchPolicy });
    return result.data ? <p>Version: {result.data.v1.info.version}</p> : <p>Loading</p>;
  }
};

it("useQuery with hash works", () => useQueryWithHashTest(false, 1, "no-cache", false));
it("useQuery with hash works with strict mode", () => useQueryWithHashTest(true, 1, "no-cache", false));
it("useQuery with hash works with strict mode, cache-first", () => useQueryWithHashTest(true, 1, "cache-first", false));
it("useQuery with hash works with strict mode, cache-and-network", () => useQueryWithHashTest(true, 1, "cache-and-network", false));

it("useQuery with hash in url works", () => useQueryWithHashTest(false, 1, "no-cache", true));
it("useQuery with hash in url works with strict mode", () => useQueryWithHashTest(true, 1, "no-cache", true));
it("useQuery with hash in url works with strict mode, cache-first", () => useQueryWithHashTest(true, 1, "cache-first", true));
it("useQuery with hash in url works with strict mode, cache-and-network", () => useQueryWithHashTest(true, 1, "cache-and-network", true));
