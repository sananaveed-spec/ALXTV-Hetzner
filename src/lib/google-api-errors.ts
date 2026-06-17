type GoogleApiErrorBody = {
  error?: { message?: string; status?: string };
};

function readApiMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const err = (data as GoogleApiErrorBody).error;
  return err?.message;
}

export type MappedGoogleError = {
  status: number;
  message: string;
  details?: string;
};

/**
 * Maps Google Sheets / Gaxios failures to stable HTTP status and copy for the UI.
 */
export function mapGoogleSheetsError(error: unknown): MappedGoogleError {
  const err = error as {
    code?: number | string;
    message?: string;
    response?: { status?: number; data?: unknown };
  };

  const status =
    typeof err.response?.status === "number"
      ? err.response.status
      : typeof err.code === "number"
        ? err.code
        : 502;

  const details =
    readApiMessage(err.response?.data) ?? err.message ?? "Unknown error";

  if (status === 404) {
    return {
      status: 404,
      message: "Spreadsheet not found. Check GOOGLE_SPREADSHEET_ID.",
      details,
    };
  }

  if (status === 403) {
    return {
      status: 403,
      message:
        "Access denied. Enable the Google Sheets API for your GCP project, and share this spreadsheet with the service account email (Viewer is enough).",
      details,
    };
  }

  if (status === 400) {
    return {
      status: 400,
      message: "Invalid request (for example a bad A1 range).",
      details,
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 502,
    message: "Failed to load data from Google Sheets.",
    details,
  };
}
