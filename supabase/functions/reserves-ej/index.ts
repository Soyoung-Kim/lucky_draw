import { getEjAdminConfig, createEjSession, verifyEjCredentials, verifyEjSession } from '../_shared/ej-admin.ts';
import { HttpError, jsonResponse, readJson, withJsonHandler } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { sha256Hex } from '../_shared/crypto.ts';

async function rateLimit(req: Request, category: string, limit: number) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  const key = await sha256Hex(`reserves-ej:${category}:${ip}`);
  const {data,error} = await getServiceClient().rpc('ej_rate_limit',{p_key:key,p_limit:limit});
  if (error) throw new HttpError('서버 설정을 확인해 주세요.',503);
  if (!data) throw new HttpError('요청이 많아요. 1분 후 다시 시도해 주세요.',429);
}

Deno.serve(req => withJsonHandler(req, async () => {
  const payload = await readJson(req);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError('잘못된 요청입니다.');
  const action = payload.action;
  if (!['calendar','request','login','list','approve','reject','cancel','day'].includes(String(action)))
    throw new HttpError('지원하지 않는 요청입니다.');
  if (!['calendar','request'].includes(String(action))) {
    getEjAdminConfig();
    if (action === 'login') {
      await rateLimit(req,'ej-login',10);
      const id = await verifyEjCredentials(payload.admin_id,payload.password);
      const session = await createEjSession(id);
      return jsonResponse({success:true,admin_session_token:session.token,expires_at:session.expires_at});
    }
    await verifyEjSession(payload.admin_session_token);
  }
  const data: Record<string,unknown> = {};
  const str = (key: string, max: number, required = true) => {
    const value = payload[key];
    if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max)
      throw new HttpError(`${key} 입력을 확인해 주세요.`);
    data[key] = value.trim();
    return value.trim();
  };
  if (action === 'request' || action === 'day') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str('day',10))) throw new HttpError('날짜를 확인해 주세요.');
  }
  if (action === 'request') {
    await rateLimit(req,'ej-request',10);
    str('requester',30); str('reason',500);
    for (const key of ['start1','end1','start2','end2']) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(str(key,5))) throw new HttpError('시간을 확인해 주세요.');
    }
    if (String(data.start1) >= String(data.end1) || String(data.start2) >= String(data.end2))
      throw new HttpError('종료 시간은 시작 시간보다 늦어야 합니다.');
    if (data.start1 === data.start2 && data.end1 === data.end2) throw new HttpError('서로 다른 두 시간대를 입력해 주세요.');
  }
  if (['approve','reject','cancel'].includes(String(action))) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str('id',36))) throw new HttpError('요청 번호를 확인해 주세요.');
    if (action === 'approve') {
      if (![1,2].includes(Number(payload.choice))) throw new HttpError('승인 순위를 선택해 주세요.');
      data.choice = Number(payload.choice);
    }
  }
  if (action === 'day') {
    if (typeof payload.is_open !== 'boolean') throw new HttpError('예약 가능 여부를 확인해 주세요.');
    data.is_open = payload.is_open; str('note',100,false); str('holiday',40,false);
  }
  const {data: result,error} = await getServiceClient().rpc('ej_action',{p_action:action,p_data:data});
  if (error) throw new HttpError(error.code === 'P0001' ? error.message : '요청을 처리하지 못했습니다. 입력값 또는 서버 설정을 확인해 주세요.',400);
  return jsonResponse({success:true,...result});
}));
