import type { Language } from './prompt';

export const DISCLAIMER: Record<Language, string> = {
  en: 'Indicative estimates only, based on the details you shared and our current product catalog. This is not a loan offer or approval. Final approval, rate and amount depend on credit underwriting, verification of income and documents, and lender policy. Please review the Key Fact Statement before accepting any loan.',
  hi: 'यह केवल अनुमानित जानकारी है, जो आपकी दी गई जानकारी और हमारे मौजूदा उत्पादों पर आधारित है। यह लोन ऑफ़र या स्वीकृति नहीं है। अंतिम स्वीकृति, ब्याज दर और राशि क्रेडिट अंडरराइटिंग, आय और दस्तावेज़ों के सत्यापन तथा लेंडर नीति पर निर्भर करती है। लोन स्वीकार करने से पहले Key Fact Statement ज़रूर पढ़ें।',
};

type Dict = Record<string, string>;
const en: Dict = {
  injection:
    "I can only help with questions about our loan products, EMIs and repayment. I can't change how I work, but I'm happy to compare products or explain your EMI options.",
  investment_advice:
    "I can't advise on investments such as stocks, crypto or trading, and borrowing to invest is risky. I can help you understand loan costs and choose an affordable EMI.",
  approval_guarantee:
    'No one can guarantee loan approval in advance. Approval depends on credit underwriting and verification of your income and documents. What I can do is show which products you appear eligible for and their estimated EMIs.',
  fraud:
    "I can't help with altering documents or hiding existing loans. Accurate information protects you from over-borrowing and is required for approval. If eligibility is tight, I can show options like a smaller amount, a longer tenure or a secured loan.",
  noRecs: 'Based on the details shared, none of our products look like a fit right now.',
  topRec:
    'Best fit for you: {name} ({status}). Estimated EMI {emi} for {tenure} at {rate}% p.a.; total interest {interest}, processing fee {fee}, total repayment {repay} (APR incl. fees {apr}%).',
  otherRecs: 'Other options:',
  whyNot: 'Not eligible:',
  tenureIntro: 'How tenure changes your cost for {name}:',
  compareIntro: 'Side-by-side for your profile:',
  updated: 'I updated your details: {fields}.',
  greet: "Hi! I'm LoanSense. Tell me how much you need, for what, and over how long, or ask me to compare products or tenures.",
  eligible: 'eligible',
  conditional: 'eligible with adjustments',
  ineligible: 'not eligible',
};
const hi: Dict = {
  injection: 'मैं केवल हमारे लोन उत्पादों, EMI और भुगतान से जुड़े सवालों में मदद कर सकता हूँ। मैं उत्पादों की तुलना या आपकी EMI के विकल्प समझा सकता हूँ।',
  investment_advice:
    'मैं शेयर, क्रिप्टो या ट्रेडिंग जैसे निवेश पर सलाह नहीं दे सकता, और निवेश के लिए उधार लेना जोखिम भरा है। मैं लोन की लागत और सही EMI चुनने में मदद कर सकता हूँ।',
  approval_guarantee:
    'कोई भी पहले से लोन स्वीकृति की गारंटी नहीं दे सकता। स्वीकृति क्रेडिट अंडरराइटिंग और दस्तावेज़ सत्यापन पर निर्भर करती है। मैं बता सकता हूँ कि आप किन उत्पादों के लिए पात्र दिखते हैं और उनकी अनुमानित EMI क्या होगी।',
  fraud:
    'मैं दस्तावेज़ बदलने या मौजूदा लोन छिपाने में मदद नहीं कर सकता। सही जानकारी आपको ज़रूरत से ज़्यादा उधार से बचाती है। मैं कम राशि, लंबी अवधि या सिक्योर्ड लोन जैसे विकल्प दिखा सकता हूँ।',
  noRecs: 'आपकी दी गई जानकारी के आधार पर अभी हमारा कोई उत्पाद उपयुक्त नहीं दिखता।',
  topRec:
    'आपके लिए सबसे उपयुक्त: {name} ({status})। {tenure} के लिए {rate}% सालाना पर अनुमानित EMI {emi}; कुल ब्याज {interest}, प्रोसेसिंग फ़ीस {fee}, कुल भुगतान {repay} (फ़ीस सहित APR {apr}%)।',
  otherRecs: 'अन्य विकल्प:',
  whyNot: 'पात्र नहीं:',
  tenureIntro: '{name} के लिए अवधि का असर:',
  compareIntro: 'आपकी प्रोफ़ाइल के लिए तुलना:',
  updated: 'मैंने आपकी जानकारी अपडेट की: {fields}।',
  greet: 'नमस्ते! मैं LoanSense हूँ। बताइए कितनी राशि, किस काम के लिए और कितने समय के लिए चाहिए, या उत्पादों/अवधि की तुलना करने को कहें।',
  eligible: 'पात्र',
  conditional: 'कुछ बदलाव के साथ पात्र',
  ineligible: 'पात्र नहीं',
};
const DICTS: Record<Language, Dict> = { en, hi };

export function t(lang: Language, key: string, vars: Record<string, string | number> = {}): string {
  const template = DICTS[lang][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
