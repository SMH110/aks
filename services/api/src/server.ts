import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "api",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});