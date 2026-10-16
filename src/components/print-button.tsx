"use client";
import { Printer } from "lucide-react";import { Button } from "./ui/button";
export function PrintButton(){return <Button className="no-print" onClick={()=>window.print()}><Printer size={17}/>Print / Save PDF</Button>}
