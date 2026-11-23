// The ONE place that says where the Nudi backend lives.
// Local:  "http://localhost:8787"
// AWS:    the ApiUrl printed by `sam deploy`, e.g.
//         "https://abc123.execute-api.ap-south-1.amazonaws.com"
// After changing it, run `npm run build` and reload the extension.

export const BACKEND_URL = "http://localhost:8787";
