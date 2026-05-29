import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <h1 className="text-3xl tracking-tight font-medium mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: May 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-medium mb-2">Data We Collect</h2>
            <p className="text-muted-foreground">
              We collect your name, email address, and financial transaction data you
              provide or import via bank sync. We do not collect browsing behaviour,
              location data, or any information beyond what is necessary to operate
              the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">How We Use Your Data</h2>
            <p className="text-muted-foreground">
              Your financial data is used exclusively to power the app's features —
              budgeting, analytics, AI insights, Maaser tracking, and UK tax
              calculators. We never sell or share your personal data with third
              parties for marketing or any other purpose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">AI Processing</h2>
            <p className="text-muted-foreground">
              When you use AI features (chat, insights, auto-categorisation), your
              transaction data is sent to our AI provider (OpenRouter) solely for the
              purpose of generating the response. These requests are not used for
              training or retained beyond the request lifecycle.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your data for as long as your account is active. You may
              request a full export or deletion of your data at any time via the
              GDPR section in Settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">Your Rights</h2>
            <p className="text-muted-foreground">
              Under UK GDPR, you have the right to access, rectify, export, and
              delete your personal data. You may also withdraw consent at any time.
              To exercise these rights, use the GDPR tools in Settings or contact
              our support team.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">Security</h2>
            <p className="text-muted-foreground">
              All data is encrypted in transit (TLS) and at rest. Bank connection
              tokens are encrypted using AES-GCM-256. Passwords are hashed with
              bcrypt. We regularly audit our security posture.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">Contact</h2>
            <p className="text-muted-foreground">
              For privacy-related inquiries, please open a support ticket from your
              Settings page or email our data protection officer.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
