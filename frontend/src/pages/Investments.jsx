import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart } from "recharts";
import { TrendingUp, Loader2, ArrowUpRight, ArrowDownRight, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import AIInsightPanel from "../components/AIInsightPanel";
import { PageHeader } from "../components/ui/layout";

const SYMBOLS = ["VUSA","VWRL","VUKE","VFEM","IWDA","EQQQ","ISF","IUSA","VHVG","SP500","FTSE","NASDAQ","BRK.B","BTC","ETH"];
const CRYPTO_TICKERS = "BTC,ETH,SOL,ADA,XRP,DOGE";
const STOCK_TICKERS = ["VUSA","VWRL","VUKE","IWDA","EQQQ","ISF","FTSE","SP500","NASDAQ"];
const CHART_TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px" };

export default function Investments() {
  useEffect(() => { document.title = "Investments | FinanceAI"; }, []);
  const [form, setForm] = useState({ symbol: "VUSA", monthly_contribution: 500, years: 20, initial_value: 5000 });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [livePrices, setLivePrices] = useState([]);
  const [priceTs, setPriceTs] = useState(null);
  const [pricesBusy, setPricesBusy] = useState(false);
  const [stocks, setStocks] = useState([]);
  const [stocksBusy, setStocksBusy] = useState(false);
  const [priceTab, setPriceTab] = useState("crypto");

  const loadPrices = useCallback(async () => {
    setPricesBusy(true);
    try {
      const { data } = await api.get(`/prices/crypto?symbols=${CRYPTO_TICKERS}`);
      setLivePrices(data.prices); setPriceTs(data.as_of);
    } catch (err) { console.error(err); toast.error("Could not load live prices"); }
    finally { setPricesBusy(false); }
  }, []);

  const loadStocks = useCallback(async () => {
    setStocksBusy(true);
    try {
      const { data } = await api.get("/prices/stocks", { params: { symbols: STOCK_TICKERS.join(",") } });
      setStocks(data.prices);
    } catch (err) { console.error(err); toast.error("Could not load stock prices"); }
    finally { setStocksBusy(false); }
  }, []);
  useEffect(() => { loadPrices(); loadStocks(); }, [loadPrices, loadStocks]);

  const applyLivePrice = (p) => {
    setForm({ ...form, symbol: p.symbol, initial_value: Math.round(p.price * 100) / 100 });
    toast.success(`Using live ${p.symbol} price ${p.currency === "USD" ? "$" : "£"}${p.price.toLocaleString()}`);
  };

  const run = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/investments/forecast", {
        symbol: form.symbol,
        monthly_contribution: Number(form.monthly_contribution),
        years: Number(form.years),
        current_value: Number(form.initial_value),
      });
      setResult(data);
    } catch { toast.error("Could not run forecast"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="investments-root">
      <PageHeader
        eyebrow="Tools"
        title="See your future net worth."
        description="Simple investment projections and live market context in a cleaner, easier-to-scan layout."
      />

      <div className="rounded-2xl border border-border bg-card p-6" data-testid="live-prices">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald" />
            <div className="flex items-center gap-1 rounded-lg bg-secondary p-0.5">
              <button onClick={() => setPriceTab("crypto")} className={`px-3 py-1 text-xs rounded-md transition-colors ${priceTab === "crypto" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Crypto</button>
              <button onClick={() => setPriceTab("stocks")} className={`px-3 py-1 text-xs rounded-md transition-colors ${priceTab === "stocks" ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>ETFs</button>
            </div>
          </div>
          <button onClick={() => { loadPrices(); loadStocks(); }} disabled={pricesBusy || stocksBusy} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 p-2 disabled:opacity-50">
            {(pricesBusy || stocksBusy) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
            {priceTs && <span className="ml-1">· {new Date(priceTs * 1000).toLocaleTimeString()}</span>}
          </button>
        </div>
        {priceTab === "crypto" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {livePrices.map((p) => {
              const up = (p.change_24h_pct || 0) >= 0;
              return (
                <button key={p.symbol} onClick={() => applyLivePrice(p)} data-testid={`price-${p.symbol}`}
                  className="rounded-xl border border-border bg-secondary/30 p-3 text-left hover:border-emerald transition-all">
                  <p className="text-xs text-muted-foreground">{p.symbol}</p>
                  <p className="text-lg tracking-tight font-medium mt-1">£{p.price?.toLocaleString(undefined,{maximumFractionDigits:2})}</p>
                  <p className={`text-xs mt-1 flex items-center gap-0.5 ${up ? "text-emerald" : "text-ruby"}`}>
                    {up ? <ArrowUpRight className="h-3 w-3"/> : <ArrowDownRight className="h-3 w-3"/>}
                    {Math.abs(p.change_24h_pct || 0).toFixed(2)}%
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stocks.map((p) => {
              const up = (p.change_24h_pct || 0) >= 0;
              const sym = p.currency === "USD" ? "$" : "£";
              return (
                <button key={p.symbol} onClick={() => applyLivePrice(p)} data-testid={`stock-${p.symbol}`}
                  className="rounded-xl border border-border bg-secondary/30 p-3 text-left hover:border-topaz transition-all">
                  <p className="text-xs text-muted-foreground truncate" title={p.long_name}>{p.long_name || p.symbol}</p>
                  <p className="text-lg tracking-tight font-medium mt-1">{sym}{p.price?.toLocaleString(undefined,{maximumFractionDigits:2})}</p>
                  <p className={`text-xs mt-1 flex items-center gap-0.5 ${up ? "text-emerald" : "text-ruby"}`}>
                    {up ? <ArrowUpRight className="h-3 w-3"/> : <ArrowDownRight className="h-3 w-3"/>}
                    {Math.abs(p.change_24h_pct || 0).toFixed(2)}%
                  </p>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">Tap any asset to use its live price as your initial investment value.</p>
      </div>

      <form onSubmit={run} className="rounded-2xl border border-border bg-card p-6 grid grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div>
          <label className="label-overline">Symbol</label>
          <select data-testid="inv-symbol" value={form.symbol} onChange={(e)=>setForm({...form, symbol:e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none">
            {SYMBOLS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label-overline">Initial (£)</label>
          <input data-testid="inv-initial" type="number" value={form.initial_value} onChange={(e)=>setForm({...form, initial_value:e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none" />
        </div>
        <div>
          <label className="label-overline">Monthly (£)</label>
          <input data-testid="inv-monthly" type="number" value={form.monthly_contribution} onChange={(e)=>setForm({...form, monthly_contribution:e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none" />
        </div>
        <div>
          <label className="label-overline">Years</label>
          <input data-testid="inv-years" type="number" value={form.years} onChange={(e)=>setForm({...form, years:e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary/50 border border-transparent focus:border-ring focus:outline-none" />
        </div>
        <button data-testid="inv-run" disabled={busy} className="btn-pill gradient-emerald text-white text-sm h-11 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Forecast"}
        </button>
      </form>

      {result && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
            <p className="label-overline">Projection · {result.symbol} @ {result.annual_return_pct}% p.a.</p>
            <div className="h-80 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.points}>
                  <defs>
                    <linearGradient id="emerald" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--emerald))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--emerald))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--emerald))" strokeWidth={2.5} fill="url(#emerald)" />
                  <Line type="monotone" dataKey="contributed" stroke="hsl(var(--topaz))" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-4">
            <Stat label="Projected value" value={`£${result.future_value.toLocaleString()}`} accent="emerald" />
            <Stat label="You contribute" value={`£${result.total_contributed.toLocaleString()}`} accent="topaz" />
            <Stat label="Net gain" value={`£${result.gain.toLocaleString()}`} accent="emerald" />
          </div>
        </div>
      )}

      {result && (
        <AIInsightPanel
          title="AI Forecast Ideas"
          subtitle={`Optimise your ${result.symbol} plan`}
          endpoint="/ai/insights/forecast"
          body={{
            symbol: result.symbol,
            initial_value: Number(form.initial_value),
            monthly_contribution: Number(form.monthly_contribution),
            years: Number(form.years),
            future_value: result.future_value,
            annual_return_pct: result.annual_return_pct,
          }}
          render={(d) => (
            <div className="mt-5 space-y-5">
              {d.summary && <p className="text-base font-medium">{d.summary}</p>}
              {d.ideas?.length > 0 && (
                <div className="space-y-3">
                  {d.ideas.map((it, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald flex-shrink-0"/>
                      <div>
                        <p className="text-sm font-medium">{it.title}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{it.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {d.alternative_etfs?.length > 0 && (
                <div>
                  <p className="label-overline mb-2">Alternative ETFs to consider</p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {d.alternative_etfs.map((e, i) => (
                      <div key={i} className="rounded-xl border border-border bg-secondary/30 p-3">
                        <p className="text-xs font-mono text-emerald">{e.ticker}</p>
                        <p className="text-sm font-medium mt-0.5">{e.name}</p>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{e.why}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {d.uk_tax_tip && (
                <div className="p-4 rounded-xl bg-emerald/5 border border-emerald/30">
                  <p className="label-overline text-emerald">UK Tax tip</p>
                  <p className="text-sm mt-1.5">{d.uk_tax_tip}</p>
                </div>
              )}
              {d.risks?.length > 0 && (
                <div>
                  <p className="label-overline mb-2 text-ruby">Risks</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {d.risks.map((r, i) => <li key={i} className="flex gap-2"><span className="text-ruby">·</span>{r}</li>)}
                  </ul>
                </div>
              )}
              {d.disclaimer && <p className="text-xs text-muted-foreground italic pt-2 border-t border-border">{d.disclaimer}</p>}
            </div>
          )}
        />
      )}
    </div>
  );
}

const Stat = ({label, value, accent}) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <p className="label-overline">{label}</p>
    <p className={`text-2xl tracking-tight font-medium mt-2 ${accent === "emerald" ? "text-emerald" : "text-topaz"}`}>{value}</p>
  </div>
);
