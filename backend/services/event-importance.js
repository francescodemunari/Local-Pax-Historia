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

module.exports = {campaignSeverity,isImportantCampaignReport};
