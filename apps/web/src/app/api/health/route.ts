export async function GET() {
  return Response.json({ status: 'ok', servico: 'sistema-komotors', timestamp: new Date().toISOString() });
}
