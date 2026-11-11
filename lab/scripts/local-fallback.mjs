export const localBaseModel = 'devstral-small-2:24b-instruct-2512-q4_K_M';
export const localFallbackModel = 'devstral-aiderdesk:24b';

// This alias changes parser metadata only. It must never replace different user weights.
export const ensureLocalFallback = async ({ request = fetch } = {}) => {
  const post = async (route, body, allowMissing = false) => {
    const response = await request('http://127.0.0.1:11435' + route, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      redirect:'error',signal:AbortSignal.timeout(30000),
    });
    if(allowMissing&&response.status===404)return null;
    if(!response.ok)throw new Error('Fallback locale: '+route+' HTTP '+response.status);
    return response.json();
  };
  const base = await post('/api/show',{model:localBaseModel});
  const source = base.modelfile?.match(/^FROM\s+(.+)$/m)?.[1];
  if(!source)throw new Error('Pesi originali del fallback non verificabili.');
  let alias = await post('/api/show',{model:localFallbackModel},true);
  const created = alias === null;
  if(created){
    await post('/api/create',{model:localFallbackModel,from:localBaseModel,parser:'ministral',parameters:{num_ctx:32768},stream:false});
    alias=await post('/api/show',{model:localFallbackModel});
  }
  if(alias.modelfile?.match(/^FROM\s+(.+)$/m)?.[1]!==source||!/^PARSER\s+ministral\s*$/m.test(alias.modelfile??'')||!/^PARAMETER\s+num_ctx\s+32768\s*$/m.test(alias.modelfile??'')){
    throw new Error('Alias locale diverso dalla variante verificata: conservato senza sovrascriverlo.');
  }
  return {model:localFallbackModel,weightsIdentical:true,parser:'ministral',created};
};
