// Battle success and event importance are separate model decisions. Ordinary
// front reports remain visible, but do not interrupt a strategic time skip.
function campaignSeverity(report) {
    if (report.unresolved) return 'minor';
    if (report.action === 'annex') return 'critical';
    if (['major','critical'].includes(report.severity) &&
        typeof report.significance_reason === 'string' && report.significance_reason.trim()) return report.severity;
    return 'moderate';
}

const isImportantCampaignReport = report => ['battle','annex'].includes(report?.action) &&
    ['major','critical'].includes(campaignSeverity(report));

function worldSeverity(event) {
    const severity=['minor','moderate','major','critical'].includes(event?.severity) ? event.severity : 'minor';
    if(!['major','critical'].includes(severity))return severity;
    // A proposed decision is not the decision taking effect. Keep it as news,
    // without a repair request or a special case for any institution or country.
    if(event.development_status!=null && event.development_status!=='occurred')return 'moderate';
    return typeof event.significance_reason==='string' && event.significance_reason.trim() ? severity : 'moderate';
}

const isImportantWorldEvent = event => ['major','critical'].includes(worldSeverity(event));

module.exports = {campaignSeverity,isImportantCampaignReport,worldSeverity,isImportantWorldEvent};
