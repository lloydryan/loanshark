import { requireAdmin,authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){
  try{
    await requireAdmin();const{id}=await context.params;const db=adminDb();
    const[loan,installments,payments,lines]=await Promise.all([
      db.collection("loans").doc(id).get(),
      db.collection("loanInstallments").where("loanId","==",id).orderBy("installmentNumber").get(),
      db.collection("payments").where("loanId","==",id).orderBy("paymentDate","desc").get(),
      db.collection("journalLines").where("loanId","==",id).orderBy("occurredAt","desc").get(),
    ]);
    if(!loan.exists)return Response.json({error:"Loan not found."},{status:404});
    return Response.json({id,...loan.data(),installments:installments.docs.map(d=>d.data()),payments:payments.docs.map(d=>({id:d.id,...d.data()})),journalLines:lines.docs.map(d=>({id:d.id,...d.data()}))});
  }catch(error){return authError(error)}
}
