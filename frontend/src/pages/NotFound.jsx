import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export default function NotFound() {
  useEffect(() => { document.title = "404 | Penni"; }, []);
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="text-center max-w-md">
        <p className="label-overline text-muted-foreground">404</p>
        <h1 className="mt-3 text-5xl tracking-tight font-semibold leading-[1.05]">Page not found</h1>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="primary" size="pill" asChild><Link to="/"><Home className="h-4 w-4 mr-2" />Go home</Link></Button>
          <Button variant="outlinePill" size="pill" onClick={() => window.history.back()}><ArrowLeft className="h-4 w-4 mr-2" />Go back</Button>
        </div>
      </div>
    </div>
  );
}
