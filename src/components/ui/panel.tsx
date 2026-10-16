import { cn } from "@/lib/utils";
export function Panel({ className,...props }:React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-xl border bg-panel",className)} {...props}/>; }
export function PageHeader({ title,description,actions }:{ title:string;description:string;actions?:React.ReactNode }) { return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-1 max-w-2xl text-sm text-muted">{description}</p></div>{actions}</header>; }
