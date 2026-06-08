import React from "react";
import { format, parseISO } from "date-fns";
import { Calendar, Clock } from "lucide-react";

function EventCard({ event, compact }) {
  const date = event.date ? parseISO(event.date) : null;
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 sm:p-4 space-y-2 hover:bg-card/80 transition-colors cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-topaz/10 text-topaz grid place-items-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{event.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{event.type?.replace(/_/g, " ")}</p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <p className="text-sm font-semibold tabular-nums">£{event.estimated_amount?.toLocaleString()}</p>
          {date && (
            <p className="text-xs text-muted-foreground">{format(date, "d MMM")}</p>
          )}
        </div>
      </div>
      {!compact && event.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {event.categories.map((c, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
              {c.name}: £{c.actual}/{c.budgeted}
            </span>
          ))}
        </div>
      )}
      {event.days_away != null && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
          <Clock className="h-3 w-3" />
          <span>{event.days_away} days away</span>
        </div>
      )}
    </div>
  );
}

export default React.memo(function PlannedEvents({ data, loading }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/50 p-4 animate-pulse">
            <div className="h-4 w-40 bg-muted rounded mb-2" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const thisMonth = data?.this_month || [];
  const upcoming = data?.upcoming || [];
  const totals = data?.totals;

  if (!thisMonth.length && !upcoming.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No planned events this month.</p>
        <p className="text-xs mt-1">Add a holiday, simcha, or other event to track it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {thisMonth.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            This Month
          </h3>
          <div className="space-y-2">
            {thisMonth.map((ev) => (
              <EventCard key={ev.id} event={ev} compact={false} />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Upcoming (next 60 days)
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
            {upcoming.map((ev) => (
              <div key={ev.id} className="min-w-[200px] snap-start">
                <EventCard event={ev} compact={true} />
              </div>
            ))}
          </div>
        </div>
      )}

      {totals && (
        <div className="flex items-center justify-between text-sm font-medium border-t border-border pt-3">
          <span>Event Totals</span>
          <div className="text-xs tabular-nums text-muted-foreground">
            Budgeted: £{totals.budgeted} &middot; Actual: £{totals.actual}
          </div>
        </div>
      )}
    </div>
  );
});
