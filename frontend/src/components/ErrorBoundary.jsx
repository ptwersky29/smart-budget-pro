import React from "react";
import { Button } from "./ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] grid place-items-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="h-12 w-12 text-ruby mx-auto mb-4" />
            <h2 className="text-xl font-medium">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-6">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Button variant="primary" onClick={() => { this.setState({ hasError: false, error: null }); window.history.pushState(null, "", "/dashboard"); }}>
              <RefreshCw className="h-4 w-4" /> Go to Dashboard
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
