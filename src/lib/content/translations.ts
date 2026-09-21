import type { UiLanguage } from "@/types/content";

const en = {
  // Global
  appName: "Medication Companion",
  aiDisclosure: "AI guide · Not a pharmacist or doctor",
  demoRecord: "BrightCare Pharmacy — demo record",
  trustBadge: "Plan checked by BrightCare Pharmacy — demo record",
  prototypeNotice: "Prototype information — not connected to a real pharmacy",
  aboutLink: "About this prototype",
  close: "Close",

  // Landing
  welcome: "Hello, Mei Ling",
  startSupport:
    "I can help you understand your medicine information from your pharmacy record.",
  callWithCompanion: "Call with companion",
  inputReassurance: "You can speak, type, or show a label.",
  help: "Help",
  language: "Language",
  settings: "Settings",

  // Utility sheets
  helpSheetTitle: "How this works",
  helpSheetBody:
    "Start a call, then tell me what you need. I only explain information from a demo pharmacy record, and I always ask you to confirm the medicine first.",
  helpSheetLimit:
    "I am an AI guide. I cannot diagnose, prescribe, or change how you take a medicine.",
  languageSheetTitle: "Language",
  settingsSheetTitle: "Settings",
  settingsPersona: "Viewing as: Mei Ling (older adult)",
  settingsSwitchPersona: "Switch persona",
  settingsMotion:
    "Animations follow your device’s reduced-motion setting.",
  settingsDemo: "Demo mode is on. All information is fictional.",

  // Active call
  repeat: "Repeat",
  getHelp: "Get help",
  endCall: "End call",
  listening: "I’m listening…",
  callGreeting: "Hello, Mei Ling. What would you like help with?",
  showLabelQuestion:
    "Let’s check this together. Would you like to show me the medicine label?",
  clarificationPrompt:
    "Would you like to show me a medicine label, or ask about your medicine schedule?",
  scheduleNeedsRecord:
    "To talk about your schedule, I first need to check a medicine against your record. Would you like to show me the medicine label?",
  showMedicine: "Show medicine",
  askSchedule: "Ask about my schedule",
  youSay: "Mei Ling says:",
  companionSays: "Companion says:",
  typeLabel: "Type your question",
  typePlaceholder: "For example: What is this medicine for?",
  send: "Send",
  voiceNotConnected:
    "Voice is not connected in this demo. Typing works the same way.",
  anotherMedicineGuide: "Of course. Tell me what you would like to check next.",

  // Camera
  cameraPermissionLabel: "Camera permission",
  cameraPermissionHeading: "I need to see the writing clearly.",
  cameraPermissionBody:
    "To read the medicine label, may I use the camera on the other side of your phone?",
  cameraPurpose:
    "The camera is used only to help match your medicine with the current demo record.",
  switchCamera: "Yes, switch camera",
  notNow: "Not now",
  cameraGuidanceLabel: "SHOW ONE MEDICINE",
  cameraGuidanceHeading: "Hold the label inside the box.",
  cameraGuidanceBody:
    "Keep the writing flat and in good light. I will tell you when I can read it.",
  showFrontLabel: "Show the front label first",
  cameraPrivacy: "The camera is only being used to read this medicine label.",
  oneMedicineOnly: "1 medicine only",
  you: "You",
  useDemoLabel: "Use demo label",
  demoCameraNote:
    "Demo view — no camera is turned on in this prototype build. Use the demo label to continue.",
  fallbackHeading: "You can still continue.",
  fallbackBody:
    "That’s okay. Without the camera, you can use the demo label to see how this works.",
  safetyExamples: "Try a safety example — demo",
  demoUnreadable: "Unreadable label — demo",
  demoMismatch: "Different medicine — demo",
  analyzingLabel: "CHECKING",
  analyzingHeading: "Reading the label…",
  analyzingBody:
    "I’m comparing it with your demo record. This only takes a moment.",

  // Confirmation
  possibleMatch: "I found a possible match",
  confirmHeading: "Is this the medicine you are holding?",
  checkName: "Please check the name on the label before continuing.",
  yesMedicine: "Yes, this is my medicine",
  tryAgain: "No, try again",
  unsure: "I’m not sure",
  fieldPatient: "Patient",
  fieldMedicine: "Medicine",
  fieldStrength: "Strength",
  fieldForm: "Form",
  formTablet: "Tablet",

  // Explanation
  explainWhatFor: "What it is for",
  explainHowTo: "How your record says to take it",
  explainWrapUp: "What would you like to do?",
  next: "Next",
  back: "Back",
  iUnderstand: "I understand",
  languageControlLabel: "Explanation language",
  languageEnglish: "English",
  languageChinese: "中文",
  moreLanguages: "More languages",
  comingSoon: "Coming soon",
  malay: "Bahasa Melayu",
  tamil: "தமிழ்",
  completeHeading: "Thank you for checking.",
  completeBody:
    "You can ask about another medicine, or end the call whenever you like.",
  anotherMedicine: "Ask about another medicine",

  // Safety
  safetyLabel: "LET’S CHECK WITH A PERSON",
  safetyHeading: "I’m not sure enough to explain this safely.",
  safetyBody:
    "Please check the label with your pharmacist, clinic, or a trusted helper.",
  reasonUnreadable: "I couldn’t read the label clearly.",
  reasonMismatch:
    "The label doesn’t match a medicine in your current demo record.",
  reasonUnsure:
    "Since this may not be the right medicine, I won’t explain it.",
  reasonMedicalQuestion:
    "That is a question for your pharmacist or clinic. I can only explain what your record says.",
  reasonHelp: "Here are some ways to reach a person.",
  reasonService: "Something didn’t work as expected on my side.",
  reasonNoInstructions:
    "I will not show any medicine instructions until we are sure.",
  tryPhoto: "Try another photo",
  checkPharmacy: "Check with pharmacy — demo",
  contactClinic: "Contact clinic — demo",
  askHelper: "Ask a trusted helper — demo",
  emergencyDemo: "Emergency services — demo",
  backToCall: "Back to the conversation",
  urgentLabel: "URGENT HELP",
  urgentHeading: "This may need urgent help.",
  urgentBody:
    "Please contact local emergency services or urgent medical care now. If you can, ask someone near you to help.",
  demoActionNotice:
    "Demo only — no call or message was sent. In a real service this would connect you to a person.",
  urgentNoCall: "This prototype cannot place emergency calls.",

  // Caregiver
  caregiverTitle: "Caregiver view — prototype",
} as const;

export type CopyKey = keyof typeof en;
type Copy = Record<CopyKey, string>;

const zhHans: Copy = {
  appName: "Medication Companion",
  aiDisclosure: "AI 助手 · 不是药剂师或医生",
  demoRecord: "BrightCare Pharmacy — 示范记录",
  trustBadge: "方案已由 BrightCare Pharmacy 核对 — 示范记录",
  prototypeNotice: "原型信息 — 未连接真实药房",
  aboutLink: "关于此原型",
  close: "关闭",

  welcome: "您好，Mei Ling",
  startSupport: "我可以帮助您了解药房记录中的用药信息。",
  callWithCompanion: "呼叫助手",
  inputReassurance: "您可以说出来、输入文字，或展示药物标签。",
  help: "帮助",
  language: "语言",
  settings: "设置",

  helpSheetTitle: "使用方法",
  helpSheetBody:
    "先开始通话，再告诉我您需要什么。我只会解释示范药房记录中的信息，并且总会先请您确认药物。",
  helpSheetLimit: "我是 AI 助手，不能诊断、开药，也不能更改您的服药方式。",
  languageSheetTitle: "语言",
  settingsSheetTitle: "设置",
  settingsPersona: "当前身份：Mei Ling（长者）",
  settingsSwitchPersona: "切换身份",
  settingsMotion: "动画会遵循您设备的“减少动态效果”设置。",
  settingsDemo: "示范模式已开启。所有信息均为虚构。",

  repeat: "重复",
  getHelp: "寻求帮助",
  endCall: "结束通话",
  listening: "我在听…",
  callGreeting: "您好，Mei Ling。您需要什么帮助？",
  showLabelQuestion: "让我们一起查看。您想给我看药物标签吗？",
  clarificationPrompt: "您想给我看药物标签，还是询问您的服药时间？",
  scheduleNeedsRecord:
    "要谈服药时间，我需要先对照您的记录核对药物。您想给我看药物标签吗？",
  showMedicine: "显示药物",
  askSchedule: "询问我的服药时间",
  youSay: "Mei Ling 说：",
  companionSays: "助手说：",
  typeLabel: "输入您的问题",
  typePlaceholder: "例如：这个药是做什么用的？",
  send: "发送",
  voiceNotConnected: "此示范未连接语音功能。输入文字的效果相同。",
  anotherMedicineGuide: "好的。请告诉我接下来想查看什么。",

  cameraPermissionLabel: "摄像头权限",
  cameraPermissionHeading: "我需要清楚地看见标签上的文字。",
  cameraPermissionBody:
    "为了阅读药物标签，我可以使用您手机另一面的摄像头吗？",
  cameraPurpose: "摄像头仅用于帮助将您的药物与当前示范记录进行比对。",
  switchCamera: "好，切换摄像头",
  notNow: "现在不要",
  cameraGuidanceLabel: "请展示一种药物",
  cameraGuidanceHeading: "请把标签放在方框内。",
  cameraGuidanceBody: "请让文字平整并保持光线充足。我会在可以阅读时告诉您。",
  showFrontLabel: "请先显示正面标签",
  cameraPrivacy: "摄像头只会用于阅读这个药物标签。",
  oneMedicineOnly: "仅限一种药物",
  you: "您",
  useDemoLabel: "使用示范标签",
  demoCameraNote: "示范画面 — 此原型版本不会开启摄像头。请使用示范标签继续。",
  fallbackHeading: "您仍然可以继续。",
  fallbackBody: "没关系。不使用摄像头，您也可以用示范标签体验流程。",
  safetyExamples: "试试安全示例 — 示范",
  demoUnreadable: "无法阅读的标签 — 示范",
  demoMismatch: "不同的药物 — 示范",
  analyzingLabel: "正在核对",
  analyzingHeading: "正在阅读标签…",
  analyzingBody: "我正在与您的示范记录比对，只需片刻。",

  possibleMatch: "我找到一个可能的匹配项",
  confirmHeading: "这是您手上拿着的药物吗？",
  checkName: "继续之前，请确认标签上的名称。",
  yesMedicine: "是的，这是我的药物",
  tryAgain: "不是，再试一次",
  unsure: "我不确定",
  fieldPatient: "患者",
  fieldMedicine: "药物",
  fieldStrength: "规格",
  fieldForm: "剂型",
  formTablet: "片剂",

  explainWhatFor: "用途",
  explainHowTo: "记录中的服用方式",
  explainWrapUp: "您接下来想做什么？",
  next: "下一步",
  back: "返回",
  iUnderstand: "我明白了",
  languageControlLabel: "说明语言",
  languageEnglish: "English",
  languageChinese: "中文",
  moreLanguages: "更多语言",
  comingSoon: "即将推出",
  malay: "Bahasa Melayu",
  tamil: "தமிழ்",
  completeHeading: "谢谢您的查看。",
  completeBody: "您可以询问另一种药物，也可以随时结束通话。",
  anotherMedicine: "询问另一种药物",

  safetyLabel: "让我们请人协助确认",
  safetyHeading: "我不够确定，不能安全地解释这个药物。",
  safetyBody: "请让药剂师、诊所或您信任的人检查标签。",
  reasonUnreadable: "我无法清楚地阅读标签。",
  reasonMismatch: "标签与您当前示范记录中的药物不符。",
  reasonUnsure: "由于这可能不是对应的药物，我不会解释它。",
  reasonMedicalQuestion:
    "这个问题需要请教药剂师或诊所。我只能解释您的记录中显示的内容。",
  reasonHelp: "以下是联系真人的几种方式。",
  reasonService: "我这边出了点问题。",
  reasonNoInstructions: "在确定之前，我不会显示任何用药指示。",
  tryPhoto: "再拍一张照片",
  checkPharmacy: "向药房确认 — 示范",
  contactClinic: "联系诊所 — 示范",
  askHelper: "询问可信任的人 — 示范",
  emergencyDemo: "紧急服务 — 示范",
  backToCall: "回到对话",
  urgentLabel: "紧急求助",
  urgentHeading: "这可能需要紧急帮助。",
  urgentBody:
    "请立即联系当地紧急服务或紧急医疗机构。如果可以，请请身边的人协助您。",
  demoActionNotice:
    "仅为示范 — 没有拨出电话或发送信息。在真实服务中，这里会为您联系真人。",
  urgentNoCall: "此原型无法拨打紧急电话。",

  caregiverTitle: "照护者视图 — 原型",
};

export const copy: Record<UiLanguage, Copy> = { en, "zh-Hans": zhHans };

export function t(language: UiLanguage, key: CopyKey): string {
  return copy[language][key] ?? copy.en[key];
}
