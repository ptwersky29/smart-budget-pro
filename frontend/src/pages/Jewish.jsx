import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Calendar, Sunrise, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/layout";
import MaaserPanel from "../components/MaaserPanel";
import Skeleton from "../components/ui/Skeleton";
import YearEndJewishReport from "../components/YearEndJewishReport";

const CITIES = ["london","manchester","gateshead","leeds","jerusalem","tel-aviv","new-york","monsey","lakewood","stamford-hill"];

function titleCase(s) {
  return s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function Jewish() {
  useEffect(() => { document.title = "Jewish Calendar | Penni"; }, []);
  // Hebcal widget state
  const [hebDate, setHebDate] = useState(null);
  const [zmanim, setZmanim] = useState(null);
  const [city, setCity] = useState(() => localStorage.getItem("zmanim_city") || "london");
  const [upcomingHols, setUpcomingHols] = useState([]);

  const loadHebcal = useCallback(async () => {
    try {
      const [today, zm, up] = await Promise.all([
        api.get("/jewish/hebcal/today"),
        api.get(`/jewish/hebcal/zmanim?city=${city}`),
        api.get("/jewish/hebcal/upcoming-holidays"),
      ]);
      setHebDate(today.data);
      setZmanim(zm.data);
      setUpcomingHols(up.data.upcoming || []);
    } catch (err) { toast.error("Could not load Hebrew calendar data"); }
  }, [city]);

  useEffect(() => { loadHebcal(); }, [loadHebcal]);

  return (
    <div className="space-y-8" data-testid="jewish-root">
      <PageHeader
        eyebrow="Jewish"
        title="Maaser & Calendar."
        description="A dedicated space for Jewish finance planning, tzedakah, and zmanim."
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-3"><Calendar className="h-4 w-4 text-topaz" /><p className="label-overline">Today's Hebrew date</p></div>
          {hebDate ? (
            <>
              <p className="text-3xl tracking-tight font-medium text-topaz" dir="rtl" lang="he" style={{fontFamily:"Fraunces"}}>{hebDate.hebrew_date}</p>
              <p className="text-xs text-muted-foreground mt-2">{hebDate.gregorian_date}</p>
              {hebDate.events?.length > 0 && (
                <div className="mt-4 space-y-1">
                  {hebDate.events.map((e) => (
                    <span key={e} className="inline-block text-xs px-2 py-1 mr-1 rounded-full bg-secondary">{e}</span>
                  ))}
                </div>
              )}
            </>
          ) : <div className="space-y-3 animate-pulse"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-32" /></div>}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2"><Sunrise className="h-4 w-4 text-topaz" /><p className="label-overline">Zmanim today</p></div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground"/>
              <select data-testid="zmanim-city" value={city} onChange={(e) => { setCity(e.target.value); localStorage.setItem("zmanim_city", e.target.value); }}
                      className="h-10 px-4 rounded-full bg-secondary/50 border border-transparent focus:border-ring focus:outline-none text-xs capitalize">
                {CITIES.map(c => <option key={c} value={c}>{titleCase(c)}</option>)}
              </select>
            </div>
          </div>
          {zmanim ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              {zmanim.times.map((t) => (
                <div key={t.key} className="flex justify-between border-b border-border/60 py-1.5">
                  <span className="text-muted-foreground">{t.label}</span>
                  <span className="font-mono font-medium">{t.time}</span>
                </div>
              ))}
            </div>
          ) : <div className="space-y-2 animate-pulse"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>}
        </div>
      </div>

      <MaaserPanel />

      <details className="rounded-2xl border border-border bg-card p-6 open:shadow-sm transition-shadow">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
          Year-End Report
        </summary>
        <div className="mt-4">
          <YearEndJewishReport />
        </div>
      </details>

      <div className="rounded-2xl border border-border bg-card p-6" data-testid="upcoming-holidays">
        <p className="label-overline">Upcoming Jewish holidays</p>
        {upcomingHols.length > 0 ? (
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {upcomingHols.slice(0,8).map((h) => (
              <div key={`${h.date}-${h.title}`} className="rounded-xl border border-border p-3 hover:border-topaz transition-colors">
                <p className="text-xs text-muted-foreground">{h.date}</p>
                <p className="font-medium mt-1 text-sm">{h.title}</p>
                {h.hebrew && <p className="text-xs text-topaz mt-1" dir="rtl" lang="he" style={{fontFamily:"Fraunces"}}>{h.hebrew}</p>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground mt-3">No upcoming holidays found</p>}
      </div>
    </div>
  );
}
