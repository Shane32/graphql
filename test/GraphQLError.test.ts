import GraphQLError from "../src/GraphQLError";

it("is an Error while preserving its response and serialized message", () => {
  const response = {
    errors: [{ message: "Query failed" }],
    networkError: false,
    size: 0,
  };

  const error = new GraphQLError(response);

  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(GraphQLError);
  expect(error.name).toBe("GraphQLError");
  expect(error.message).toBe("Query failed");
  expect(error.response).toBe(response);
  expect(error.stack).toEqual(expect.any(String));
  expect(JSON.parse(JSON.stringify(error)).message).toBe("Query failed");
});
