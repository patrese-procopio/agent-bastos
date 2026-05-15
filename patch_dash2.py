f = open(r'C:\Users\Administrador\agent-bastos-app\src\Dashboard.jsx', encoding='latin-1')
c = f.read()
f.close()

old = '        {/* ABA POR DOCUMENTO */}'
new = '''        {/* ABA LANCAMENTO */}
        {aba === "lancamento" && (
          <div style={{padding:"20px",overflowY:"auto",flex:1}}>
            <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 340px",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:20}}>
                <div style={{fontSize:11,fontWeight:800,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:16}}>Registrar Documento</div>
                {msgLanc && <div style={{padding:"8px 12px",borderRadius:6,marginBottom:12,background:msgLanc.startsWith("OK")?"#F0FDF4":"#FEF2F2",color:msgLanc.startsWith("OK")?"#16A34A":"#DC2626",fontSize:11,fontWeight:600}}>{msgLanc}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>TIPO DE DOCUMENTO</div>
                    <select value={formDoc.tipo_codigo} onChange={e=>setFormDoc(f=>({...f,tipo_codigo:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit"}}>
                      <option value="RELINT">Relatorio de Inteligencia</option>
                      <option value="RELTEC">Relatorio Tecnico</option>
                      <option value="REL_INTERNO">Relatorio Interno</option>
                      <option value="PARLATORIO">Parlatorio Virtual</option>
                      <option value="PARECER_REM">Parecer Tecnico de Remicao</option>
                      <option value="PED_BUSCA">Pedido de Busca</option>
                      <option value="MEMORANDO">Memorando</option>
                      <option value="REPEN">REPEN</option>
                    </select>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>NUCLEO</div>
                      <select value={formDoc.nucleo_sigla} onChange={e=>setFormDoc(f=>({...f,nucleo_sigla:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit"}}>
                        <option value="NI">NI</option>
                        <option value="NCI">NCI</option>
                        <option value="NBE">NBE</option>
                      </select>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>UNIDADE</div>
                      <select value={formDoc.unidade_sigla} onChange={e=>setFormDoc(f=>({...f,unidade_sigla:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit"}}>
                        <option value="">-- Nenhuma --</option>
                        <option value="UPP">UPP</option>
                        <option value="COMPAJ">COMPAJ</option>
                        <option value="IPAT">IPAT</option>
                        <option value="CDPM1">CDPM1</option>
                        <option value="CDPM2">CDPM2</option>
                        <option value="CDF">CDF</option>
                      </select>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>MES</div>
                      <select value={formDoc.mes} onChange={e=>setFormDoc(f=>({...f,mes:parseInt(e.target.value)}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit"}}>
                        {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m,i)=>(
                          <option key={i} value={i+1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>ANO</div>
                      <select value={formDoc.ano} onChange={e=>setFormDoc(f=>({...f,ano:parseInt(e.target.value)}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit"}}>
                        <option value={2025}>2025</option>
                        <option value={2026}>2026</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>NOME DO ARQUIVO (opcional)</div>
                    <input value={formDoc.nome_arquivo} onChange={e=>setFormDoc(f=>({...f,nome_arquivo:e.target.value}))} placeholder="Ex: RELINT_NI_001_MAI2026.pdf" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:4}}>OBSERVACAO</div>
                    <input value={formDoc.observacao} onChange={e=>setFormDoc(f=>({...f,observacao:e.target.value}))} placeholder="Opcional" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:11,fontFamily:"inherit",boxSizing:"border-box"}}/>
                  </div>
                  <button disabled={salvando} onClick={async()=>{
                    setSalvando(true); setMsgLanc("")
                    try {
                      const nome = formDoc.nome_arquivo || formDoc.tipo_codigo+"_"+formDoc.nucleo_sigla+"_"+formDoc.mes+"_"+formDoc.ano+".pdf"
                      const res = await fetch("http://127.0.0.1:8000/dashboard/lancar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...formDoc,nome_arquivo:nome})})
                      if(!res.ok) throw new Error(await res.text())
                      setMsgLanc("OK - Documento registrado!")
                      setFormDoc(f=>({...f,nome_arquivo:"",observacao:""}))
                    } catch(e){ setMsgLanc("ERRO: "+e.message) }
                    setSalvando(false)
                  }} style={{padding:"9px",borderRadius:7,border:"none",background:"#B45309",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:"0.05em"}}>
                    {salvando ? "Salvando..." : "REGISTRAR DOCUMENTO"}
                  </button>
                </div>
              </div>
              <div style={{flex:"1 1 340px",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:20,maxHeight:500,overflowY:"auto"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:12}}>Ultimos Registros — {formDoc.ano}</div>
                <UltimosDocs ano={formDoc.ano} salvando={salvando}/>
              </div>
            </div>
          </div>
        )}
        {/* ABA POR DOCUMENTO */}'''
c = c.replace(old, new, 1)
open(r'C:\Users\Administrador\agent-bastos-app\src\Dashboard.jsx', 'w', encoding='latin-1').write(c)
print('ok patch 2')
