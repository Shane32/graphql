import * as React from "react";
import { render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
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

it("useQuery keeps pending no-cache sibling requests active when passive effects are deferred", async () => {
  const client = new GraphQLClient({ url: "https://api.example.com/api/graphql" });
  const mounted = jest.fn();
  const initialTime = performance.now();
  let elapsed = 0;
  const now = jest.spyOn(performance, "now").mockImplementation(() => initialTime + elapsed);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const actEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;

  function TestUseQuery() {
    const result = useQuery<{ version: string }>("{ version }", { client, fetchPolicy: "no-cache" });
    React.useEffect(() => {
      mounted();
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
        <TestUseQuery />
        <TestUseQuery />
        <DeferPassiveEffects />
      </>,
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(mounted).toHaveBeenCalledTimes(2));
    expect(requests.every((request) => !request.request.signal.aborted)).toBe(true);
    expect(screen.getAllByText("Loading")).toHaveLength(2);
    expect(client.getPendingRequests()).toBe(2);

    root.unmount();

    await waitFor(() => expect(requests.every((request) => request.request.signal.aborted)).toBe(true));
    await waitFor(() => expect(client.getPendingRequests()).toBe(0));
    expect(requests).toHaveLength(2);
  } finally {
    root.unmount();
    container.remove();
    now.mockRestore();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  }
});

it("useQuery works with strict mode", () => useQueryTest(true, 2, "no-cache"));
it("useQuery works with strict mode, cache-first", () => useQueryTest(true, 1, "cache-first"));
it("useQuery works with strict mode, cache-and-network", () => useQueryTest(true, 1, "cache-and-network"));

it.each(["no-cache", "cache-first", "cache-and-network"] as const)(
  "useQuery keeps only one active request in strict mode with %s",
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

    const expectedRequests = fetchPolicy === "no-cache" ? 2 : 1;
    await waitFor(() => expect(requests).toHaveLength(expectedRequests));
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(requests[0].request.signal.aborted).toBe(fetchPolicy === "no-cache");
    const activeRequests = requests.filter((request) => !request.request.signal.aborted);
    expect(activeRequests).toHaveLength(1);
    await waitFor(() => expect(client.getPendingRequests()).toBe(1));

    // Keep the response pending until Strict Mode has finished replaying the effects.
    activeRequests[0].resolve(
      new Response(JSON.stringify({ data: { version: "12345" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(screen.getByText("12345")).toBeInTheDocument());
    expect(requests).toHaveLength(expectedRequests);
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
it("useQuery with hash works with strict mode", () => useQueryWithHashTest(true, 2, "no-cache", false));
it("useQuery with hash works with strict mode, cache-first", () => useQueryWithHashTest(true, 1, "cache-first", false));
it("useQuery with hash works with strict mode, cache-and-network", () => useQueryWithHashTest(true, 1, "cache-and-network", false));

it("useQuery with hash in url works", () => useQueryWithHashTest(false, 1, "no-cache", true));
it("useQuery with hash in url works with strict mode", () => useQueryWithHashTest(true, 2, "no-cache", true));
it("useQuery with hash in url works with strict mode, cache-first", () => useQueryWithHashTest(true, 1, "cache-first", true));
it("useQuery with hash in url works with strict mode, cache-and-network", () => useQueryWithHashTest(true, 1, "cache-and-network", true));
