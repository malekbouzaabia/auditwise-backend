const express = require('express')
const router  = express.Router()
const PDFDocument = require('pdfkit')
const { execSync } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

async function generateRadarChart(domains, domainScores) {
  try {
    const { ChartJSNodeCanvas } = require('chartjs-node-canvas')
    const width = 500, height = 500
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' })

    const labels = domains.map((d, i) => (d.label || ('D'+(i+1))).substring(0, 12))
    const scores = domains.map((d, i) => domainScores[i] || 0)

    const config = {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'Conformité ISO 27001',
          data: scores,
          backgroundColor: 'rgba(27, 111, 216, 0.2)',
          borderColor: 'rgba(27, 111, 216, 1)',
          borderWidth: 2,
          pointBackgroundColor: scores.map(s => s >= 70 ? '#22c55e' : s >= 40 ? '#f59e0b' : '#ef4444'),
          pointRadius: 4,
        }]
      },
      options: {
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, font: { size: 9 } },
            pointLabels: { font: { size: 9 } }
          }
        },
        plugins: {
          legend: { display: true, position: 'top' }
        }
      }
    }

    const buffer = await chartJSNodeCanvas.renderToBuffer(config)
    return buffer
  } catch (e) {
    console.error('Radar error:', e.message)
    return null
  }
}


router.post('/rapport', async (req, res) => {
  try {
    const { domains: rawDomains, answers, domainScores, globalScore, userName, reclamations = {} } = req.body
    const domains = (rawDomains || []).map(d => ({ ...d, questions: Array.isArray(d.questions) ? d.questions : [] }))
    if (!domains.length) return res.status(400).json({ error: 'Domains manquants' })

    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true, bufferPages: true })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename=Rapport_AuditWise.pdf')
    doc.pipe(res)

    const BLUE='#1b6fd8', BLUE2='#0d2a60', DARK='#0b1f45'
    const GREEN='#22c55e', RED='#ef4444', ORANGE='#f59e0b'
    const GRAY='#6b8cba', LGRAY='#f8faff', WHITE='#ffffff'
    const W=doc.page.width, H=doc.page.height, M=40, CW=W-2*M

    function scoreColor(s){ return s>=70?GREEN:s>=40?ORANGE:RED }
    function scoreLabel(s){ return s>=70?'Conforme':s>=40?'Partiellement conforme':'Non-conforme' }
    let Y=0

    function drawPageHeader(title) {
      doc.rect(0,0,W,48).fill(BLUE2)
      doc.rect(0,44,W,4).fill(BLUE)
      doc.circle(M+16,24,14).fill(BLUE)
      doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold').text('AW',M+9,19)
      doc.fillColor(WHITE).fontSize(12).font('Helvetica-Bold').text('AuditWise AI',M+36,10)
      doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica').text('Rapport ISO 27001:2022',M+36,25)
      if(title) doc.fillColor('rgba(255,255,255,0.85)').fontSize(9).font('Helvetica-Bold').text(title,W-M-180,19,{width:180,align:'right'})
      Y=62
    }
    function drawPageFooter() {
      doc.rect(0,H-32,W,32).fill(DARK)
      doc.rect(0,H-36,W,4).fill(BLUE)
      doc.fillColor('rgba(255,255,255,0.5)').fontSize(7.5).font('Helvetica')
         .text('AuditWise AI — Rapport Confidentiel ISO 27001:2022',M,H-20)
    }
    function newDetailPage(){
      drawPageFooter()
      doc.addPage()
      drawPageHeader('DETAIL DES DOMAINES')
    }
    function ensureSpace(n){ if(Y+n>H-50) newDetailPage() }

    // PAGE 1 COUVERTURE
    doc.rect(0,0,W,H).fill(BLUE2)
    doc.rect(0,0,W,6).fill(BLUE)
    // Cercles décoratifs
    doc.save()
    doc.circle(-50,-50,220).fill('#0d3b8a')
    doc.circle(W+60,H-80,260).fill('#0a2d6e')
    doc.restore()
    // Logo
    doc.circle(W/2,125,60).fill(BLUE)
    doc.fillColor(WHITE).fontSize(26).font('Helvetica-Bold').text('AW',W/2-22,110)
    doc.fillColor(WHITE).fontSize(30).font('Helvetica-Bold').text('AuditWise',0,198,{align:'center'})
    doc.fillColor('rgba(255,255,255,0.55)').fontSize(11).font('Helvetica').text('Intelligence Artificielle • Sécurité • Conformité ISO 27001',0,234,{align:'center'})
    doc.rect(W/2-80,262,160,2).fill(BLUE)
    doc.fillColor(WHITE).fontSize(22).font('Helvetica-Bold').text("RAPPORT D'AUDIT",0,276,{align:'center'})
    doc.fillColor('rgba(255,255,255,0.65)').fontSize(13).font('Helvetica').text('ISO/IEC 27001:2022',0,306,{align:'center'})
    // Carte score
    const sc=scoreColor(globalScore), cX=W/2-100, cY=342
    doc.roundedRect(cX+3,cY+3,200,96,14).fill('rgba(0,0,0,0.35)')
    doc.roundedRect(cX,cY,200,96,14).fill(WHITE)
    doc.roundedRect(cX,cY,200,8,14).fill(sc)
    doc.rect(cX,cY+4,200,4).fill(sc)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('SCORE GLOBAL',cX,cY+18,{width:200,align:'center'})
    doc.fillColor(sc).fontSize(44).font('Helvetica-Bold').text(globalScore+'%',cX,cY+28,{width:200,align:'center'})
    doc.fillColor(GRAY).fontSize(10).font('Helvetica').text(scoreLabel(globalScore),cX,cY+74,{width:200,align:'center'})
    // Infos
    doc.fillColor('rgba(255,255,255,0.7)').fontSize(10).font('Helvetica')
    if(userName) doc.text('Organisation : '+userName,0,462,{align:'center'})
    doc.text('Date : '+new Date().toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),0,480,{align:'center'})
    doc.text('Généré par AuditWise AI — Confidentiel',0,498,{align:'center'})
    // Stats bas
    const totalQ=domains.reduce((a,d)=>a+d.questions.length,0)
    const trueA=Object.values(answers).filter(a=>a===true).length
    const partA=Object.values(answers).filter(a=>a==='partial').length
    const falseA=Object.values(answers).filter(a=>a===false).length
    const sY=H-155
    doc.roundedRect(M,sY,CW,90,10).fill('rgba(255,255,255,0.07)')
    ;[{v:totalQ,l:'Questions',c:WHITE},{v:trueA,l:'Conformes',c:GREEN},{v:partA,l:'Partiels',c:ORANGE},{v:falseA,l:'Non-conformes',c:RED},{v:domains.length,l:'Domaines',c:BLUE}].forEach((s,i)=>{
      const sx=M+i*(CW/5)
      doc.fillColor(s.c).fontSize(24).font('Helvetica-Bold').text(s.v.toString(),sx,sY+18,{width:CW/5,align:'center'})
      doc.fillColor('rgba(255,255,255,0.5)').fontSize(8).font('Helvetica').text(s.l,sx,sY+50,{width:CW/5,align:'center'})
    })
    doc.rect(0,H-32,W,32).fill('rgba(0,0,0,0.4)')
    doc.fillColor('rgba(255,255,255,0.4)').fontSize(7.5).font('Helvetica').text('AuditWise AI — Rapport Confidentiel ISO/IEC 27001:2022',0,H-18,{align:'center'})

    // PAGE 2 SCORES
    doc.addPage()
    drawPageHeader('SCORES PAR DOMAINE')
    doc.fillColor(DARK).fontSize(16).font('Helvetica-Bold').text('Évaluation par domaine',M,Y)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('ISO/IEC 27001:2022 — '+domains.length+' domaines analysés',M,Y+20)
    doc.rect(M,Y+34,CW,2).fill(BLUE)
    Y+=46

    domains.forEach((domain,idx)=>{
      const score=domainScores[idx]||0, col=scoreColor(score)
      const rowH=34
      if(idx%2===0) doc.rect(M,Y,CW,rowH).fill(LGRAY)
      doc.circle(M+14,Y+rowH/2,12).fill(BLUE)
      doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold').text((idx+1).toString(),M+2,Y+rowH/2-5,{width:24,align:'center'})
      doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(domain.label,M+32,Y+7,{width:190})
      doc.fillColor(GRAY).fontSize(7.5).font('Helvetica').text('Clause '+(domain.clause||'-'),M+32,Y+20)
      const bX=M+230, bW=185, bH=9, bY=Y+(rowH-bH)/2
      doc.roundedRect(bX,bY,bW,bH,4).fill('#dce8f8')
      if(score>0) doc.roundedRect(bX,bY,bW*score/100,bH,4).fill(col)
      const dW=55
      doc.roundedRect(W-M-dW,Y+7,dW,20,5).fill(col+'22').stroke(col)
      doc.fillColor(col).fontSize(11).font('Helvetica-Bold').text(score+'%',W-M-dW,Y+10,{width:dW,align:'center'})
      if(idx<domains.length-1) doc.rect(M+30,Y+rowH-0.5,CW-30,0.5).fill('#dce8f8')
      Y+=rowH
    })
    Y+=16
    doc.roundedRect(M,Y,CW,44,10).fill(scoreColor(globalScore))
    doc.fillColor(WHITE).fontSize(14).font('Helvetica-Bold')
       .text('SCORE GLOBAL : '+globalScore+'% — '+scoreLabel(globalScore).toUpperCase(),M,Y+14,{width:CW,align:'center'})
    Y+=58
    drawPageFooter()

    // PAGE 3 RADAR
    doc.addPage()
    drawPageHeader('ANALYSE VISUELLE — RADAR DE CONFORMITÉ')
    doc.fillColor(DARK).fontSize(15).font('Helvetica-Bold').text('Radar de Conformité ISO 27001:2022',M,Y)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('Vue globale des '+domains.length+' domaines de sécurité',M,Y+18)
    Y+=36
    const radarBuf=generateRadarChart(domains,domainScores)
    if(radarBuf){
      const iS=410, iX=(W-iS)/2
      doc.image(radarBuf,iX,Y,{width:iS,height:iS})
      Y+=iS+18
    } else {
      doc.roundedRect(M,Y,CW,80,8).fill(LGRAY)
      doc.fillColor(GRAY).fontSize(11).text('Graphique radar non disponible',M,Y+30,{width:CW,align:'center'})
      Y+=90
    }
    // Légende
    ;[{c:GREEN,l:'Conforme ≥ 70%'},{c:ORANGE,l:'Partiellement conforme 40-70%'},{c:RED,l:'Non-conforme < 40%'}].forEach((l,i)=>{
      const lW=(CW-20)/3, lX=M+i*(lW+10)
      doc.roundedRect(lX,Y,lW,28,6).fill(l.c+'22').stroke(l.c)
      doc.circle(lX+13,Y+14,5).fill(l.c)
      doc.fillColor(DARK).fontSize(8.5).font('Helvetica-Bold').text(l.l,lX+23,Y+9,{width:lW-30})
    })
    Y+=38
    drawPageFooter()

    // PAGES DETAIL
    doc.addPage()
    drawPageHeader('DETAIL DES DOMAINES — Questions & Réponses')

    domains.forEach((domain,domIdx)=>{
      const dScore=domainScores[domIdx]||0, dCol=scoreColor(dScore)
      ensureSpace(56)
      // Header domaine
      doc.roundedRect(M,Y,CW,44,8).fill(BLUE2)
      doc.roundedRect(M,Y,5,44,3).fill(dCol)
      doc.rect(M+3,Y,2,44).fill(dCol)
      doc.circle(M+24,Y+22,14).fill(BLUE)
      doc.fillColor(WHITE).fontSize(10).font('Helvetica-Bold').text((domIdx+1).toString(),M+10,Y+16,{width:28,align:'center'})
      doc.fillColor(WHITE).fontSize(12).font('Helvetica-Bold').text(domain.label,M+44,Y+8,{width:CW-130})
      doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica').text('Clause '+(domain.clause||'N/A'),M+44,Y+24)
      const dbW=62
      doc.roundedRect(W-M-dbW-4,Y+11,dbW,22,6).fill(dCol)
      doc.fillColor(WHITE).fontSize(13).font('Helvetica-Bold').text(dScore+'%',W-M-dbW-4,Y+15,{width:dbW,align:'center'})
      Y+=52

      domain.questions.forEach((question,qIdx)=>{
        const key=domIdx+'-'+qIdx, answer=answers[key]
        const isTrue=answer===true, isFalse=answer===false, isPartial=answer==='partial'
        const badge=isTrue?'VRAI':isFalse?'FAUX':isPartial?'PARTIEL':'?'
        const bCol=isTrue?GREEN:isFalse?RED:isPartial?ORANGE:GRAY
        const bgCol=isTrue?'#f0fff4':isFalse?'#fff5f5':isPartial?'#fff8f0':LGRAY
        const qScore=isTrue?100:isPartial?50:0
        const recl=reclamations[key]||null
        let qH=36
        if((isFalse||isPartial)&&recl){ const th=doc.heightOfString(recl,{width:CW-105,fontSize:7.5}); qH=36+th+14 }
        ensureSpace(qH+4)
        doc.roundedRect(M,Y,CW,qH,5).fill(bgCol)
        doc.roundedRect(M,Y,3,qH,2).fill(bCol)
        doc.rect(M+1,Y,2,qH).fill(bCol)
        doc.fillColor(GRAY).fontSize(7.5).font('Helvetica-Bold').text('Q'+(qIdx+1),M+8,Y+12)
        doc.fillColor(DARK).fontSize(9).font('Helvetica').text(question,M+25,Y+10,{width:CW-118})
        const bW=65
        doc.roundedRect(W-M-bW,Y+8,bW,18,4).fill(bCol)
        doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold').text(badge,W-M-bW,Y+12,{width:bW,align:'center'})
        doc.fillColor(bCol).fontSize(7.5).font('Helvetica-Bold').text(qScore+'%',W-M-bW,Y+27,{width:bW,align:'center'})
        if((isFalse||isPartial)&&recl){
          const rC=isFalse?'#b91c1c':'#b45309', rL=isFalse?'→ Action requise :':'→ À améliorer :'
          doc.fillColor(rC).fontSize(7.5).font('Helvetica-Bold').text(rL,M+25,Y+28)
          doc.fillColor(rC).fontSize(7.5).font('Helvetica').text(recl,M+25,Y+38,{width:CW-105})
        }
        Y+=qH+4
      })
      Y+=14
    })

    drawPageFooter()
    const pc=doc.bufferedPageRange().count
    for(let i=0;i<pc;i++) doc.switchToPage(i)
    doc.end()

  } catch(err){
    console.error('Erreur PDF:',err.message)
    if(!res.headersSent) res.status(500).json({error:err.message})
  }
})

module.exports = router

// ══════════════════════════════════════════════════════════════
// RAPPORT COLLECTIF CAMPAGNE avec Analyse IA
// ══════════════════════════════════════════════════════════════
router.post('/rapport-campagne', async (req, res) => {
  try {
    const { campagne, rapports, domainScores, globalScore, recommendations } = req.body
    if (!campagne || !rapports?.length) return res.status(400).json({ error: 'Données manquantes' })

    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true, bufferPages: true })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename=Rapport_Campagne_' + campagne.nom?.replace(/\s/g,'_') + '.pdf')
    doc.pipe(res)

    const BLUE='#1b6fd8', BLUE2='#0d2a60', DARK='#0b1f45'
    const GREEN='#22c55e', RED='#ef4444', ORANGE='#f59e0b'
    const GRAY='#6b8cba', LGRAY='#f8faff', WHITE='#ffffff'
    const W=doc.page.width, H=doc.page.height, M=40, CW=W-2*M

    function scoreColor(s){ return s>=70?GREEN:s>=40?ORANGE:RED }
    function scoreLabel(s){ return s>=70?'Conforme':s>=40?'Partiellement conforme':'Non-conforme' }
    let Y=0

    function drawHeader(title) {
      doc.rect(0,0,W,48).fill(BLUE2)
      doc.rect(0,44,W,4).fill('#8b5cf6')
      doc.circle(M+16,24,14).fill('#8b5cf6')
      doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold').text('AW',M+9,19)
      doc.fillColor(WHITE).fontSize(12).font('Helvetica-Bold').text('AuditWise AI',M+36,10)
      doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica').text('Rapport Collectif de Campagne',M+36,25)
      if(title) doc.fillColor('rgba(255,255,255,0.85)').fontSize(9).font('Helvetica-Bold').text(title,W-M-200,19,{width:200,align:'right'})
      Y=62
    }
    function drawFooter() {
      doc.rect(0,H-32,W,32).fill(DARK)
      doc.rect(0,H-36,W,4).fill('#8b5cf6')
      doc.fillColor('rgba(255,255,255,0.5)').fontSize(7.5).font('Helvetica').text('AuditWise AI — Rapport Collectif Campagne ISO 27001:2022 — Confidentiel',M,H-20)
    }
    function newPage(title) { drawFooter(); doc.addPage(); drawHeader(title) }
    function ensureSpace(n) { if(Y+n>H-50) newPage('SUITE') }

    // ── PAGE 1 COUVERTURE ──────────────────────────────────────
    doc.rect(0,0,W,H).fill(BLUE2)
    doc.rect(0,0,W,6).fill('#8b5cf6')
    doc.save()
    doc.circle(-50,-50,220).fill('#1a0a60')
    doc.circle(W+60,H-80,260).fill('#0a1d6e')
    doc.restore()

    // Logo
    doc.circle(W/2,110,55).fill('#8b5cf6')
    doc.fillColor(WHITE).fontSize(22).font('Helvetica-Bold').text('AW',W/2-18,96)
    doc.fillColor(WHITE).fontSize(28).font('Helvetica-Bold').text('AuditWise',0,180,{align:'center'})
    doc.fillColor('rgba(255,255,255,0.55)').fontSize(11).font('Helvetica').text('Rapport Collectif de Campagne',0,215,{align:'center'})
    doc.rect(W/2-80,242,160,2).fill('#8b5cf6')

    doc.fillColor(WHITE).fontSize(20).font('Helvetica-Bold').text("RAPPORT DE CAMPAGNE",0,258,{align:'center'})
    doc.fillColor('rgba(255,255,255,0.65)').fontSize(13).font('Helvetica').text('ISO/IEC 27001:2022',0,286,{align:'center'})

    // Carte campagne
    const sc=scoreColor(globalScore), cX=W/2-100, cY=320
    doc.roundedRect(cX+3,cY+3,200,100,14).fill('rgba(0,0,0,0.35)')
    doc.roundedRect(cX,cY,200,100,14).fill(WHITE)
    doc.roundedRect(cX,cY,200,8,14).fill('#8b5cf6')
    doc.rect(cX,cY+4,200,4).fill('#8b5cf6')
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(campagne.nom||'Campagne',cX,cY+16,{width:200,align:'center'})
    doc.fillColor(sc).fontSize(40).font('Helvetica-Bold').text(globalScore+'%',cX,cY+28,{width:200,align:'center'})
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(scoreLabel(globalScore),cX,cY+72,{width:200,align:'center'})
    doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(rapports.length+' auditeur(s)',cX,cY+86,{width:200,align:'center'})

    // Infos
    doc.fillColor('rgba(255,255,255,0.7)').fontSize(10).font('Helvetica')
    doc.text('Période : '+new Date(campagne.dateDebut).toLocaleDateString('fr-FR')+' → '+new Date(campagne.dateFin).toLocaleDateString('fr-FR'),0,445,{align:'center'})
    doc.text('Date de clôture : '+new Date().toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),0,463,{align:'center'})
    doc.text('Généré automatiquement par AuditWise AI',0,481,{align:'center'})

    // Stats bas
    const sY=H-155
    doc.roundedRect(M,sY,CW,90,10).fill('rgba(255,255,255,0.07)')
    const conforme = rapports.filter(r=>r.globalScore>=70).length
    const partiel  = rapports.filter(r=>r.globalScore>=40&&r.globalScore<70).length
    const nonConf  = rapports.filter(r=>r.globalScore<40).length
    ;[{v:rapports.length,l:'Participants',c:WHITE},{v:conforme,l:'Conformes',c:GREEN},{v:partiel,l:'Partiels',c:ORANGE},{v:nonConf,l:'Non-conformes',c:RED},{v:13,l:'Domaines',c:'#8b5cf6'}]
    .forEach((s,i)=>{
      const sx=M+i*(CW/5)
      doc.fillColor(s.c).fontSize(24).font('Helvetica-Bold').text(s.v.toString(),sx,sY+18,{width:CW/5,align:'center'})
      doc.fillColor('rgba(255,255,255,0.5)').fontSize(8).font('Helvetica').text(s.l,sx,sY+50,{width:CW/5,align:'center'})
    })
    doc.rect(0,H-32,W,32).fill('rgba(0,0,0,0.4)')
    doc.fillColor('rgba(255,255,255,0.4)').fontSize(7.5).font('Helvetica').text('AuditWise AI — Confidentiel — ISO/IEC 27001:2022',0,H-18,{align:'center'})

    // ── PAGE 2 SCORES MOYENS ───────────────────────────────────
    doc.addPage(); drawHeader('SCORES MOYENS PAR DOMAINE')
    doc.fillColor(DARK).fontSize(15).font('Helvetica-Bold').text('Scores moyens par domaine',M,Y)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('Moyenne calculée sur '+rapports.length+' auditeur(s) — Campagne : '+campagne.nom,M,Y+18)
    doc.rect(M,Y+32,CW,2).fill('#8b5cf6')
    Y+=44

    ;(domainScores||[]).forEach((d,idx)=>{
      const col=scoreColor(d.score)
      const rowH=34
      if(idx%2===0) doc.rect(M,Y,CW,rowH).fill(LGRAY)
      doc.circle(M+14,Y+rowH/2,12).fill('#8b5cf6')
      doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold').text((idx+1).toString(),M+2,Y+rowH/2-5,{width:24,align:'center'})
      doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(d.label,M+32,Y+7,{width:190})
      doc.fillColor(GRAY).fontSize(7.5).font('Helvetica').text('Clause '+(d.clause||'-')+' · '+d.participants+' participant(s)',M+32,Y+20)
      const bX=M+230, bW=180, bH=9, bY=Y+(rowH-bH)/2
      doc.roundedRect(bX,bY,bW,bH,4).fill('#dce8f8')
      if(d.score>0) doc.roundedRect(bX,bY,bW*d.score/100,bH,4).fill(col)
      const dW=55
      doc.roundedRect(W-M-dW,Y+7,dW,20,5).fill(col+'22').stroke(col)
      doc.fillColor(col).fontSize(11).font('Helvetica-Bold').text(d.score+'%',W-M-dW,Y+10,{width:dW,align:'center'})
      if(idx<domainScores.length-1) doc.rect(M+30,Y+rowH-0.5,CW-30,0.5).fill('#dce8f8')
      Y+=rowH
    })

    Y+=16
    doc.roundedRect(M,Y,CW,44,10).fill(scoreColor(globalScore))
    doc.fillColor(WHITE).fontSize(14).font('Helvetica-Bold')
       .text('SCORE GLOBAL CAMPAGNE : '+globalScore+'% — '+scoreLabel(globalScore).toUpperCase(),M,Y+14,{width:CW,align:'center'})
    Y+=58
    drawFooter()

    // ── PAGE 3 RADAR CHART ─────────────────────────────────────
    doc.addPage(); drawHeader('RADAR DE CONFORMITÉ COLLECTIF')
    doc.fillColor(DARK).fontSize(15).font('Helvetica-Bold').text('Radar de Conformité — Vision Collective',M,Y)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('Scores moyens des '+rapports.length+' auditeurs — Campagne : '+campagne.nom,M,Y+18)
    Y+=36
    const radarData = (domainScores||[]).map(d=>({label:d.label,score:d.score}))
    const radarBuf  = generateRadarChart(radarData.map(d=>({label:d.label})), Object.fromEntries(radarData.map((d,i)=>[i,d.score])))
    if(radarBuf){
      const iS=410, iX=(W-iS)/2
      doc.image(radarBuf,iX,Y,{width:iS,height:iS})
      Y+=iS+18
    }
    ;[{c:GREEN,l:'Conforme >= 70%'},{c:ORANGE,l:'Partiellement conforme 40-70%'},{c:RED,l:'Non-conforme < 40%'}]
    .forEach((l,i)=>{
      const lW=(CW-20)/3, lX=M+i*(lW+10)
      doc.roundedRect(lX,Y,lW,28,6).fill(l.c+'22').stroke(l.c)
      doc.circle(lX+13,Y+14,5).fill(l.c)
      doc.fillColor(DARK).fontSize(8.5).font('Helvetica-Bold').text(l.l,lX+23,Y+9,{width:lW-30})
    })
    drawFooter()

    // ── PAGE 4 ANALYSE IA & RECOMMANDATIONS ────────────────────
    doc.addPage(); drawHeader('ANALYSE IA & RECOMMANDATIONS')
    doc.fillColor(DARK).fontSize(15).font('Helvetica-Bold').text('Analyse des domaines critiques',M,Y)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text('Recommandations générées par AuditWise AI basées sur ISO 27001:2022',M,Y+18)
    doc.rect(M,Y+32,CW,2).fill(RED)
    Y+=44

    ;(recommendations||[]).forEach((rec,i)=>{
      const col = rec.score>=70?GREEN:rec.score>=40?ORANGE:RED
      const bgCol = rec.score>=70?'#f0fff4':rec.score>=40?'#fff8f0':'#fff5f5'

      ensureSpace(rec.recommandation ? 130 : 80)

      // Header domaine
      doc.roundedRect(M,Y,CW,36,8).fill(BLUE2)
      doc.roundedRect(M,Y,5,36,3).fill(col)
      doc.rect(M+3,Y,2,36).fill(col)
      doc.circle(M+22,Y+18,12).fill(col)
      doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold').text((i+1).toString(),M+10,Y+12,{width:24,align:'center'})
      doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold').text(rec.label,M+40,Y+7,{width:CW-130})
      doc.fillColor('rgba(255,255,255,0.6)').fontSize(8).font('Helvetica').text('Clause '+(rec.clause||'N/A')+' · Score moyen : '+rec.score+'%',M+40,Y+21)
      doc.roundedRect(W-M-65,Y+8,60,20,5).fill(col)
      doc.fillColor(WHITE).fontSize(12).font('Helvetica-Bold').text(rec.score+'%',W-M-65,Y+11,{width:60,align:'center'})
      Y+=42

      // Causes
      if(rec.causes) {
        doc.roundedRect(M,Y,CW,28,5).fill(bgCol)
        doc.fillColor(col).fontSize(8).font('Helvetica-Bold').text('⚠️ Causes identifiées :',M+10,Y+8)
        doc.fillColor(DARK).fontSize(8).font('Helvetica').text(rec.causes,M+10,Y+18,{width:CW-20})
        Y+=32
      }

      // Recommandation
      if(rec.recommandation) {
        const rH = doc.heightOfString(rec.recommandation,{width:CW-50,fontSize:8.5}) + 24
        doc.roundedRect(M,Y,CW,rH,5).fill(bgCol)
        doc.roundedRect(M,Y,4,rH,2).fill('#8b5cf6')
        doc.rect(M+2,Y,2,rH).fill('#8b5cf6')
        doc.fillColor('#8b5cf6').fontSize(8).font('Helvetica-Bold').text('💡 Recommandation IA :',M+14,Y+8)
        doc.fillColor(DARK).fontSize(8.5).font('Helvetica').text(rec.recommandation,M+14,Y+18,{width:CW-24})
        Y+=rH+4
      }

      Y+=12
    })

    drawFooter()

    // ── PAGE 5 PARTICIPANTS ────────────────────────────────────
    doc.addPage(); drawHeader('LISTE DES PARTICIPANTS')
    doc.fillColor(DARK).fontSize(15).font('Helvetica-Bold').text('Participants de la campagne',M,Y)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(rapports.length+' auditeur(s) ont participé à : '+campagne.nom,M,Y+18)
    doc.rect(M,Y+32,CW,2).fill(BLUE)
    Y+=44

    // Tableau header
    doc.rect(M,Y,CW,28).fill(BLUE2)
    doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
    doc.text('Auditeur',M+10,Y+10,{width:180})
    doc.text('Score',M+200,Y+10,{width:60,align:'center'})
    doc.text('Statut',M+270,Y+10,{width:100,align:'center'})
    doc.text('Date',M+380,Y+10,{width:130,align:'right'})
    Y+=28

    rapports.forEach((r,i)=>{
      ensureSpace(32)
      const rScore = r.globalScore||0
      const rCol   = scoreColor(rScore)
      if(i%2===0) doc.rect(M,Y,CW,28).fill(LGRAY)
      doc.circle(M+14,Y+14,10).fill(BLUE)
      doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold').text((r.userEmail||'?').slice(0,2).toUpperCase(),M+6,Y+9,{width:20,align:'center'})
      doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(r.userEmail||'Anonyme',M+30,Y+9,{width:160})
      doc.fillColor(rCol).fontSize(13).font('Helvetica-Bold').text(rScore+'%',M+200,Y+7,{width:60,align:'center'})
      doc.roundedRect(M+274,Y+6,96,16,4).fill(rCol+'22').stroke(rCol)
      doc.fillColor(rCol).fontSize(8).font('Helvetica-Bold').text(scoreLabel(rScore),M+274,Y+9,{width:96,align:'center'})
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(r.createdAt?new Date(r.createdAt).toLocaleDateString('fr-FR'):'—',M+380,Y+9,{width:130,align:'right'})
      if(i<rapports.length-1) doc.rect(M+10,Y+27,CW-10,0.5).fill('#dce8f8')
      Y+=28
    })

    drawFooter()

    const pc=doc.bufferedPageRange().count
    for(let i=0;i<pc;i++) doc.switchToPage(i)
    doc.end()

  } catch(err){
    console.error('Erreur rapport campagne:',err.message)
    if(!res.headersSent) res.status(500).json({error:err.message})
  }
})

module.exports = router