import { cn } from "@/lib/utils";
export function Field({ label,error,hint,children }:{ label:string;error?:string;hint?:string;children:React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span>{children}{error?<span className="text-xs text-danger">{error}</span>:hint?<span className="text-xs font-normal text-muted">{hint}</span>:null}</label>; }
export const inputClass=cn("h-10 w-full rounded-lg border bg-panel px-3 text-sm text-foreground placeholder:text-muted/70 focus:border-blue-500 disabled:opacity-60");
