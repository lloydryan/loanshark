import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin,authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { loanBorrowerCorrectionSchema } from "@/lib/validation";
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

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  try {
    const admin=await requireAdmin();
    const{id}=await context.params;
    const parsed=loanBorrowerCorrectionSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"Select a borrower and provide a correction reason of at least 10 characters."},{status:400});
    const db=adminDb();
    const loanRef=db.collection("loans").doc(id);
    const borrowerRef=db.collection("borrowers").doc(parsed.data.borrowerId);
    const[loan,borrower,installments,payments]=await Promise.all([
      loanRef.get(),borrowerRef.get(),
      db.collection("loanInstallments").where("loanId","==",id).get(),
      db.collection("payments").where("loanId","==",id).get(),
    ]);
    if(!loan.exists)return Response.json({error:"Loan not found."},{status:404});
    if(!borrower.exists||borrower.data()?.status==="archived")return Response.json({error:"Select an active borrower."},{status:400});
    const previousBorrowerId=String(loan.data()?.borrowerId);
    if(previousBorrowerId===parsed.data.borrowerId)return Response.json({error:"This loan already belongs to that borrower."},{status:400});
    const batch=db.batch();
    batch.update(loanRef,{borrowerId:parsed.data.borrowerId,updatedAt:FieldValue.serverTimestamp()});
    installments.docs.forEach(item=>batch.update(item.ref,{borrowerId:parsed.data.borrowerId}));
    payments.docs.forEach(item=>batch.update(item.ref,{borrowerId:parsed.data.borrowerId}));
    batch.create(db.collection("auditLogs").doc(),{action:"loan.borrower_corrected",entityType:"loan",entityId:id,adminUid:admin.uid,previousBorrowerId,borrowerId:parsed.data.borrowerId,reason:parsed.data.reason,affectedInstallments:installments.size,affectedPayments:payments.size,createdAt:FieldValue.serverTimestamp()});
    await batch.commit();
    return Response.json({ok:true,previousBorrowerId,borrowerId:parsed.data.borrowerId,affectedInstallments:installments.size,affectedPayments:payments.size});
  } catch(error){return authError(error)}
}
