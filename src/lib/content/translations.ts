import type { UiLanguage } from "@/types/content";

const en = {
  // Global
  appName: "Medication Companion",
  aiDisclosure: "AI guide · Not a pharmacist or doctor",
  trustBadge: "Plan checked by BrightCare Pharmacy · {verifiedDate}",
  prototypeNotice: "Prototype information — not connected to a real pharmacy",
  // The one prototype marker on every screen (CLAUDE.md § H1); replaces per-button "demo" labels.
  prototypeBadge: "Prototype · fictional data",
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
    "Start a call, then tell me what you need. I only explain information from your pharmacy record, and I always ask you to confirm the medicine first.",
  helpSheetLimit:
    "I am an AI guide. I cannot diagnose, prescribe, or change how you take a medicine.",
  languageSheetTitle: "Language",
  settingsSheetTitle: "Settings",
  settingsPersona: "Viewing as: Mei Ling (older adult)",
  settingsSwitchPersona: "Switch persona",
  settingsMotion:
    "Animations follow your device’s reduced-motion setting.",
  settingsDemo: "This is a prototype. All information is fictional.",

  // Active call
  repeat: "Repeat slowly",
  getHelp: "Get help",
  endCall: "End call",
  listening: "I’m listening…",
  callGreeting: "Hello, I’m an AI guide. What would you like to know today?",
  showLabelQuestion:
    "Let’s check this together. Would you like to show me the medicine label?",
  clarificationPrompt:
    "Would you like to show me a medicine label, or ask about your medicine schedule?",
  scheduleNeedsRecord:
    "To talk about your schedule, I first need to check a medicine against your record. Would you like to show me the medicine label?",
  prescriptionsListed:
    "Your pharmacy record shows one medicine on file: Metformin 500 mg. Would you like to show me the label so I can explain it?",
  // The person named (or roughly named — speech recognition often hears
  // "Metformin" as "met for pain") the medicine in their hand. Acknowledge it
  // without treating it as confirmed: only the label check can confirm.
  medicineMentioned:
    "It sounds like you may have your Metformin with you — that’s the medicine on your pharmacy record. So I can check it’s the same one, would you like to show me the label?",
  // Heard something CLOSE to the record's medicine name, but not the name
  // itself. Check what was meant before moving on — and offer ways to answer
  // that don't depend on pronunciation — rather than jumping to the label.
  medicineNameCheck:
    "I want to make sure I heard you right. Did you mean Metformin? You can say “yes”, say the name again, or type or spell it below. Or, if it’s easier, you can show me the label.",
  medicineNameRetry:
    "No problem — speech can be tricky to catch. Could you tell me the medicine name again? Typing it, or spelling it out letter by letter, works well too. You can also show me the label.",
  // Spine-based redirection: acknowledge what was said, then walk back to the
  // one thing this companion does. Never used for safety-classified input.
  offTopicSocial:
    "It’s nice to hear from you. I’m an AI companion, so I stay with one thing — the medicine information in your pharmacy record. Would you like to show me a medicine label, or ask about your schedule?",
  offTopicWorld:
    "I’d enjoy talking about that, but it’s outside what I know. What I can help with is the medicine information in your pharmacy record. Would you like to show me a medicine label, or ask about your schedule?",
  offTopicCapability:
    "I can’t do that myself. If you tap Get help, I can ask a pharmacist to call you or let your family know. I can also help you understand the medicine information in your record.",
  // After two off-topic turns in a row: warm, and hands the choice back.
  offTopicWrapUp:
    "It’s been lovely chatting with you. Shall we look at your medicine together, or would you like to end the call for now?",
  // Loneliness or low mood: not brushed off, not treated as a medical question.
  wellbeing:
    "Thank you for telling me — that sounds hard. I’m only a medicine helper, but you don’t have to manage things alone. Would you like me to let your family know you’d like some company, or shall we carry on together?",
  // Speech recognition wasn't confident: ask again before acting on a guess.
  didntCatch: "Sorry, I didn’t quite catch that. Could you say it again? Typing it works well too.",
  showMedicine: "Show medicine",
  askSchedule: "Ask about my schedule",
  youSay: "Mei Ling says:",
  companionSays: "Companion says:",
  companionThinking: "Let me think about that…",
  typeLabel: "Type your question",
  typePlaceholder: "For example: What is this medicine for?",
  send: "Send",
  voiceListeningNow: "I’m listening… please speak now.",
  voiceSpeaking: "Speaking…",
  voiceMicOn: "Mic on",
  voiceMicOff: "Mic off",
  voiceMicLabel: "Microphone",
  voicePaused:
    "I’m still here. Tap “Mic on” when you’re ready to talk, or type instead.",
  voiceDidntCatch:
    "Sorry, I didn’t catch that. Please say it again, or use the buttons.",
  // Step-aware versions of the line above. Outside the open conversation the
  // companion knows exactly what this step is waiting for, so it says so
  // instead of leaving the person to guess ("what do I do now?").
  unclearExplain:
    "I didn’t quite catch that. You can say “next” to hear the rest, “go back”, or “repeat that”.",
  unclearExplainLast:
    "I didn’t quite catch that. That’s everything your record says. You can say “I understand” when you’re ready, or “repeat that”.",
  unclearRecordConflict:
    "I didn’t quite catch that. You can say “pharmacist” for help checking, or “carry on”.",
  unclearConfirmMatch:
    "I didn’t quite catch that. Is this your medicine? You can say “yes”, “no”, or “I’m not sure”.",
  unclearCameraPermission:
    "I didn’t quite catch that. You can say “yes” to open the camera, or “no” to type the label instead.",
  unclearCameraGuidance:
    "I didn’t quite catch that. You can say “take a photo”, or tell me the medicine name and strength.",
  unclearShowMedicine:
    "I didn’t quite catch that. You can say “camera”, choose a photo, or tell me the medicine name and strength.",
  unclearSafety:
    "I didn’t quite catch that. You can say “try another label”, or “back to the conversation”. You can also say “get help”.",
  unclearComplete:
    "I didn’t quite catch that. You can say “another medicine”, or “end call”.",
  askStrengthForSpokenLabel:
    "Got it. What strength does the label say — for example, 500 milligrams?",
  spokenLabelHint:
    "You can also just tell me the medicine name and strength — for example, “It’s Metformin, 500 milligrams.”",
  voicePrivacy:
    "Your browser may send your voice to its own speech service to turn it into text. Typing works the same way.",
  voiceUnsupported: "Voice input isn’t available in this browser. Typing works the same way.",
  voiceDenied:
    "The microphone is off. You can allow it in your browser settings, or keep typing.",
  voiceNoSpeech: "I didn’t hear anything. Tap to try again, or type instead.",
  voiceNoMic: "I couldn’t find a microphone. You can keep typing.",
  voiceNetwork: "The voice service couldn’t be reached. You can keep typing.",
  voiceUnknown: "Voice didn’t work this time. You can keep typing.",
  anotherMedicineGuide: "Of course. Tell me what you would like to check next.",

  // Camera
  cameraPermissionLabel: "Camera permission",
  cameraPermissionHeading: "I need to see the writing clearly.",
  cameraPermissionBody:
    "To read the medicine label, may I use the camera on the other side of your phone?",
  cameraPurpose:
    "The camera is used only to help match your medicine with your current pharmacy record.",
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
  // Showing the medicine: camera or photo, equally (CLAUDE.md § H2).
  showMedicineHeading: "How would you like to show me your medicine?",
  useCamera: "Use camera",
  choosePhoto: "Choose a photo",
  typeName: "Type the name",
  photoIntro:
    "You can choose a photo of your medicine label. I’ll only look at the medicine name, and the photo won’t be kept.",
  photoFormat: "I couldn’t open that photo. Would you like to try another one, or use the camera instead?",
  cameraStarting: "Starting the camera… allow it in your browser if asked.",
  cameraLiveSummary: "Live view from your camera. Hold the medicine label inside the box.",
  captureLabel: "Take photo of label",
  flipToFace: "Show my face instead",
  flipToMedicine: "Show the medicine camera",
  captureError: "I couldn’t capture that photo. Please try again.",
  moreWays: "Other ways to show the label",
  typeLabelToggle: "Type the label details",
  chooseFromMedicines: "Choose from my medicines",
  medicineListHeading: "Which medicine are you holding?",
  medicineListNote: "These are the medicines on your BrightCare Pharmacy record. You’ll still check it on the next step.",
  typedHeading: "Type what the label says",
  fieldMedicineName: "Medicine name",
  fieldStrengthInput: "Strength (for example 500 mg)",
  fieldPatientOptional: "Patient name (optional)",
  typedSubmit: "Check these details",
  typedRequired: "Please fill in the medicine name and strength.",
  cameraDeniedHeading: "The camera is off.",
  cameraDeniedBody:
    "That’s okay. You can allow the camera in your browser settings, or choose a photo, pick from your medicines, or type the name instead.",
  cameraUnavailableHeading: "I couldn’t find a camera.",
  cameraUnavailableBody:
    "You can choose a photo, pick from your medicines, or type the name instead.",
  fallbackHeading: "You can still continue.",
  fallbackBody:
    "That’s okay. You can choose a photo, pick from your medicines, or type the name instead.",
  analyzingLabel: "CHECKING",
  analyzingHeading: "Thank you, let me have a look.",
  analyzingBody: "This will just take a moment.",

  // Confirmation
  possibleMatch: "I found a possible match",
  // {medicine} and {strength} are filled from the candidate's record — a *possible* match, never certain.
  confirmHeading: "I found a possible match: {medicine}, {strength}. Is this the one you’re holding?",
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
  explainHintNext: "Say or type “next” to continue, or “go back”",
  explainHintDone: "When you’re ready, say or type “I understand”",
  // The person disputes the record. {verifiedDate} and {instruction} are filled
  // by code from the verified record — never typed here, never model-written.
  recordConflict:
    "Thank you for telling me — it’s good to double-check. Your pharmacy record, checked on {verifiedDate}, says: “{instruction}” Sometimes a doctor changes things and the record takes a little while to catch up, so it’s no trouble to ask. Would you like help checking with the pharmacist, or shall we carry on for now?",
  carryOn: "Carry on",
  // Comparing the record with the physical label: a wrong answer nobody questions
  // is the most dangerous failure, so the explanation asks.
  recordCheckedOn: "BrightCare Pharmacy · checked {verifiedDate}",
  labelCheckPrompt: "Does this match what’s printed on your label?",
  // Shown in place of record lines in the transcript while the call is escalated.
  recordHidden: "Your record is tucked away while we get you some help.",
  labelMatches: "Yes, it matches",
  labelLooksDifferent: "It looks different",
  labelDiffers:
    "Thank you for checking — that’s really helpful. When the label and the record don’t agree, a pharmacist is the best person to look. Would you like help contacting them?",
  unclearLabelCheck:
    "I didn’t quite catch that. Does this match your label? You can say “yes, it matches” or “it looks different”.",
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
  // Non-urgent label outcomes (unreadable, mismatch, ambiguous, unsure): no-fault and unhurried.
  labelSafetyHeading: "Let’s check this one together.",
  labelSafetyBody:
    "Thank you for checking. That happens sometimes, and I’d rather be careful than guess. Would you like to try another photo, or ask someone to check it with you?",
  reasonUnreadable: "I couldn’t read the label clearly.",
  reasonMismatch:
    "The label doesn’t match a medicine in your current pharmacy record.",
  reasonUnsure:
    "Since this may not be the right medicine, I won’t explain it.",
  reasonMedicalQuestion:
    "That is a question for your pharmacist or clinic. I can only explain what your record says.",
  reasonHelp: "Here are some ways to reach a person.",
  reasonService:
    "I couldn’t read that photo. You can try again, type what the label says, or choose from your medicines.",
  reasonNoInstructions:
    "I will not show any medicine instructions until we are sure.",
  tryPhoto: "Try another photo",
  retryUsed: "We have tried the label again. The safest next step is to ask a person to check it with you.",
  // Help flows (CLAUDE.md § H4). Each asks first; "sent" only after the service succeeds.
  askPharmacistCall: "Ask a pharmacist to call me",
  contactClinic: "Contact my clinic",
  askHelper: "Ask my trusted helper",
  letFamilyKnow: "Let my family know",
  moreHelpOptions: "More ways to get help",
  callbackConfirm:
    "I can ask BrightCare Pharmacy to call you on the number in your record. They usually call within one working day. Shall I send the request?",
  callbackYes: "Yes, send the request",
  callbackSent:
    "Thank you. I’ve sent your request to BrightCare Pharmacy. Your reference is {reference}. Is there anything else I can help you with?",
  // Family / trusted-helper help needs consent every time: the button only asks the question.
  familyConsent: "Shall I let your family know you’d like some help? I’ll only do this if you say yes.",
  helperConsent: "Shall I let {name}, your trusted helper, know you’d like some help? I’ll only do this if you say yes.",
  familyConsentYes: "Yes, let them know",
  familySent: "Thank you. I’ve let {caregiverName} know you’d like some help. Would you like to carry on while you wait?",
  helpSending: "Sending your request…",
  serviceTrouble:
    "I’m sorry, I couldn’t send that just now. Would you like to try again, or see the pharmacy’s phone number instead?",
  sendAgain: "Try again",
  seePharmacyNumber: "See the pharmacy’s number",
  pharmacyNumber: "You can call {name} on {phone}. Is there anything else I can help you with?",
  clinicNumber: "You can call {name} on {phone}. Is there anything else I can help you with?",
  unclearHelpConfirm: "I didn’t quite catch that. You can say “yes”, or “not now”.",
  backToCall: "Back to the conversation",
  urgentLabel: "URGENT HELP",
  urgentHeading: "This may need urgent help.",
  urgentBody:
    "Please contact local emergency services or urgent medical care now. If you can, ask someone near you to help.",
  urgentNoCall: "This prototype cannot place emergency calls.",
  // Shown as text on the self-harm path — never as a call the app claims to make.
  crisisLines: "Samaritans of Singapore (24 hours): 1767 · Emergency: 995",

  // Caregiver
  caregiverTitle: "Caregiver view — prototype",
} as const;

export type CopyKey = keyof typeof en;
type Copy = Record<CopyKey, string>;

const zhHans: Copy = {
  appName: "Medication Companion",
  aiDisclosure: "AI 助手 · 不是药剂师或医生",
  trustBadge: "方案已由 BrightCare Pharmacy 核对 · {verifiedDate}",
  prototypeNotice: "原型信息 — 未连接真实药房",
  prototypeBadge: "原型 · 虚构数据",
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
    "先开始通话，再告诉我您需要什么。我只会解释您药房记录中的信息，并且总会先请您确认药物。",
  helpSheetLimit: "我是 AI 助手，不能诊断、开药，也不能更改您的服药方式。",
  languageSheetTitle: "语言",
  settingsSheetTitle: "设置",
  settingsPersona: "当前身份：Mei Ling（长者）",
  settingsSwitchPersona: "切换身份",
  settingsMotion: "动画会遵循您设备的“减少动态效果”设置。",
  settingsDemo: "这是原型，所有信息均为虚构。",

  repeat: "慢速重复",
  getHelp: "寻求帮助",
  endCall: "结束通话",
  listening: "我在听…",
  callGreeting: "您好，我是AI向导。今天想了解什么呢？",
  showLabelQuestion: "让我们一起查看。您想给我看药物标签吗？",
  clarificationPrompt: "您想给我看药物标签，还是询问您的服药时间？",
  scheduleNeedsRecord:
    "要谈服药时间，我需要先对照您的记录核对药物。您想给我看药物标签吗？",
  prescriptionsListed:
    "您的药房记录显示您有一种药物：二甲双胍 500 毫克。您想给我看标签，让我为您解释吗？",
  medicineMentioned:
    "听起来您手边可能有二甲双胍——这是您药房记录中的药物。为了确认是同一种药，您想给我看标签吗？",
  medicineNameCheck:
    "我想确认我没有听错。您是说二甲双胍吗？您可以说“是”，再说一次药名，或在下方输入。如果更方便，也可以给我看标签。",
  medicineNameRetry:
    "没关系——语音有时不容易听清。可以再告诉我一次药名吗？也可以在下方输入药名。您也可以给我看标签。",
  offTopicSocial:
    "很高兴听到您说话。我是一位 AI 助手，只专注于一件事——您药房记录中的药物信息。您想给我看药物标签，还是询问您的服药时间？",
  offTopicWorld:
    "我也很想聊这个，不过这超出了我知道的范围。我能帮您了解的是您药房记录中的药物信息。您想给我看药物标签，还是询问您的服药时间？",
  offTopicCapability:
    "这个我自己做不到。点击「寻求帮助」，我可以请药剂师给您回电，或告诉您的家人。我也可以帮您了解记录中的药物信息。",
  offTopicWrapUp: "和您聊天很开心。我们一起看看您的药，还是先结束通话？",
  wellbeing:
    "谢谢您告诉我，这听起来不容易。我只是一个用药小帮手，但您不必一个人面对。需要我告诉您的家人您想有人陪陪您吗，还是我们一起继续？",
  didntCatch: "不好意思，我没听清楚。可以再说一次吗？也可以直接打字。",
  showMedicine: "显示药物",
  askSchedule: "询问我的服药时间",
  youSay: "Mei Ling 说：",
  companionSays: "助手说：",
  companionThinking: "让我想一想……",
  typeLabel: "输入您的问题",
  typePlaceholder: "例如：这个药是做什么用的？",
  send: "发送",
  voiceListeningNow: "我在听…请说话。",
  voiceSpeaking: "正在说话…",
  voiceMicOn: "麦克风已开",
  voiceMicOff: "麦克风已关",
  voiceMicLabel: "麦克风",
  voicePaused: "我还在这里。准备好说话时，请点“麦克风已开”，或改用输入文字。",
  voiceDidntCatch: "抱歉，我没听清楚。请再说一遍，或使用按钮。",
  unclearExplain:
    "我没太听清楚。您可以说「继续」听下一部分，或说「返回」、「重复」。",
  unclearExplainLast:
    "我没太听清楚。这就是您记录中的全部内容。准备好时可以说「我明白了」，或说「重复」。",
  unclearRecordConflict: "我没太听清楚。您可以说「药剂师」请人帮忙确认，或说「继续」。",
  unclearConfirmMatch:
    "我没太听清楚。这是您的药物吗？您可以说「是」、「不是」，或「我不确定」。",
  unclearCameraPermission:
    "我没太听清楚。您可以说「是」打开相机，或说「不是」改用输入标签。",
  unclearCameraGuidance:
    "我没太听清楚。您可以说「拍照」，或告诉我药物名称和剂量。",
  unclearShowMedicine: "我没太听清楚。您可以说「相机」、选择照片，或告诉我药物名称和剂量。",
  unclearSafety:
    "我没太听清楚。您可以说「再试一个标签」，或「回到对话」。也可以说「寻求帮助」。",
  unclearComplete: "我没太听清楚。您可以说「另一种药」，或「结束通话」。",
  askStrengthForSpokenLabel: "好的。标签上写的是多少剂量？例如：500 毫克。",
  spokenLabelHint:
    "您也可以直接说出药物名称和剂量——例如：“是二甲双胍，500 毫克。”",
  voicePrivacy:
    "您的浏览器可能会把您的声音发送到它自己的语音服务，转换成文字。输入文字的效果相同。",
  voiceUnsupported: "此浏览器不支持语音输入。输入文字的效果相同。",
  voiceDenied: "麦克风未开启。您可以在浏览器设置中允许使用，或继续输入文字。",
  voiceNoSpeech: "我没有听到声音。请点击再试一次，或改用输入文字。",
  voiceNoMic: "我找不到麦克风。您可以继续输入文字。",
  voiceNetwork: "无法连接语音服务。您可以继续输入文字。",
  voiceUnknown: "这次语音没有成功。您可以继续输入文字。",
  anotherMedicineGuide: "好的。请告诉我接下来想查看什么。",

  cameraPermissionLabel: "摄像头权限",
  cameraPermissionHeading: "我需要清楚地看见标签上的文字。",
  cameraPermissionBody:
    "为了阅读药物标签，我可以使用您手机另一面的摄像头吗？",
  cameraPurpose: "摄像头仅用于帮助将您的药物与您当前的药房记录进行比对。",
  switchCamera: "好，切换摄像头",
  notNow: "现在不要",
  cameraGuidanceLabel: "请展示一种药物",
  cameraGuidanceHeading: "请把标签放在方框内。",
  cameraGuidanceBody: "请让文字平整并保持光线充足。我会在可以阅读时告诉您。",
  showFrontLabel: "请先显示正面标签",
  cameraPrivacy: "摄像头只会用于阅读这个药物标签。",
  oneMedicineOnly: "仅限一种药物",
  you: "您",
  showMedicineHeading: "您想怎样给我看您的药？",
  useCamera: "使用相机",
  choosePhoto: "选择照片",
  typeName: "输入药名",
  photoIntro: "您可以选择一张药品标签的照片。我只看药品名称，照片不会被保存。",
  photoFormat: "这张照片我打不开。您想换一张，还是改用相机？",
  cameraStarting: "正在启动摄像头…如浏览器询问，请选择允许。",
  cameraLiveSummary: "摄像头实时画面。请把药物标签放在方框内。",
  captureLabel: "拍下标签照片",
  flipToFace: "改为显示我的脸",
  flipToMedicine: "切换回药物摄像头",
  captureError: "我无法拍下这张照片，请再试一次。",
  moreWays: "其他展示标签的方式",
  typeLabelToggle: "输入标签上的信息",
  chooseFromMedicines: "从我的药物中选择",
  medicineListHeading: "您手上拿的是哪一种药？",
  medicineListNote: "这些是您在BrightCare药房记录中的药物。下一步您仍需要确认。",
  typedHeading: "请输入标签上的文字",
  fieldMedicineName: "药物名称",
  fieldStrengthInput: "规格（例如 500 mg）",
  fieldPatientOptional: "患者姓名（选填）",
  typedSubmit: "核对这些信息",
  typedRequired: "请填写药物名称和规格。",
  cameraDeniedHeading: "摄像头未开启。",
  cameraDeniedBody:
    "没关系。您可以在浏览器设置中允许使用摄像头，也可以选择照片、从您的药物中选择，或输入药名。",
  cameraUnavailableHeading: "我找不到摄像头。",
  cameraUnavailableBody: "您可以选择照片、从您的药物中选择，或输入药名。",
  fallbackHeading: "您仍然可以继续。",
  fallbackBody: "没关系。您可以选择照片、从您的药物中选择，或输入药名。",
  analyzingLabel: "正在核对",
  analyzingHeading: "谢谢，我来看一看。",
  analyzingBody: "请稍等一下。",

  possibleMatch: "我找到一个可能的匹配项",
  confirmHeading: "我找到一个可能的匹配：{medicine}，{strength}。是您手上的这一种吗？",
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
  explainHintNext: "请说或输入「下一步」继续，或说「返回」",
  explainHintDone: "准备好后，请说或输入「我明白了」",
  recordConflict:
    "谢谢您告诉我，多确认一下是很好的。您的药房记录（{verifiedDate}确认）写着：“{instruction}” 有时候医生会调整用药，记录可能还没来得及更新，所以问一问完全没关系。您想让我帮您联系药剂师确认一下，还是我们先继续？",
  carryOn: "先继续",
  recordCheckedOn: "BrightCare Pharmacy · {verifiedDate}核对",
  labelCheckPrompt: "这和您标签上印的一样吗？",
  recordHidden: "在我们为您寻求帮助时，记录内容先收起来了。",
  labelMatches: "是的，一样",
  labelLooksDifferent: "看起来不一样",
  labelDiffers:
    "谢谢您仔细核对，这很有帮助。标签和记录不一样的时候，最好请药剂师看一看。需要我帮您联系他们吗？",
  unclearLabelCheck: "我没太听清楚。这和您的标签一样吗？您可以说「一样」或「不一样」。",
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
  labelSafetyHeading: "我们一起再确认一下。",
  labelSafetyBody:
    "谢谢您的确认。这种情况很常见，我宁可小心一点也不想猜。您想再拍一张，还是请人和您一起核对？",
  reasonUnreadable: "我无法清楚地阅读标签。",
  reasonMismatch: "标签与您当前药房记录中的药物不符。",
  reasonUnsure: "由于这可能不是对应的药物，我不会解释它。",
  reasonMedicalQuestion:
    "这个问题需要请教药剂师或诊所。我只能解释您的记录中显示的内容。",
  reasonHelp: "以下是联系真人的几种方式。",
  reasonService: "我无法读取这张照片。您可以再试一次、输入标签上的文字，或从您的药物中选择。",
  reasonNoInstructions: "在确定之前，我不会显示任何用药指示。",
  tryPhoto: "再拍一张照片",
  retryUsed: "我们已经再试过一次标签。最安全的做法是请一位真人和您一起核对。",
  askPharmacistCall: "请药剂师给我回电",
  contactClinic: "联系我的诊所",
  askHelper: "请我信任的人帮忙",
  letFamilyKnow: "告诉我的家人",
  moreHelpOptions: "更多求助方式",
  callbackConfirm:
    "我可以请BrightCare药房按您记录上的号码给您回电。他们通常会在一个工作日内联系您。要我发送请求吗？",
  callbackYes: "好，发送请求",
  callbackSent: "谢谢，我已经把您的请求发给BrightCare药房了。您的参考编号是{reference}。还有什么我可以帮您的吗？",
  familyConsent: "需要我告诉您的家人您想请他们帮忙吗？只有您同意，我才会联系。",
  helperConsent: "需要我告诉您信任的{name}您想请他们帮忙吗？只有您同意，我才会联系。",
  familyConsentYes: "好，告诉他们",
  familySent: "谢谢，我已经告诉{caregiverName}您需要帮忙了。等待的时候，要不要我们先继续？",
  helpSending: "正在发送您的请求…",
  serviceTrouble: "不好意思，刚才没能发送成功。您想再试一次，还是看看药房的电话号码？",
  sendAgain: "再试一次",
  seePharmacyNumber: "查看药房电话",
  pharmacyNumber: "您可以拨打{phone}联系{name}。还有什么我可以帮您的吗？",
  clinicNumber: "您可以拨打{phone}联系{name}。还有什么我可以帮您的吗？",
  unclearHelpConfirm: "我没太听清楚。您可以说「好」，或说「现在不用」。",
  backToCall: "回到对话",
  urgentLabel: "紧急求助",
  urgentHeading: "这可能需要紧急帮助。",
  urgentBody:
    "请立即联系当地紧急服务或紧急医疗机构。如果可以，请请身边的人协助您。",
  urgentNoCall: "此原型无法拨打紧急电话。",
  crisisLines: "新加坡援人协会（24小时）：1767 · 紧急电话：995",

  caregiverTitle: "照护者视图 — 原型",
};

export const copy: Record<UiLanguage, Copy> = { en, "zh-Hans": zhHans };

export function t(language: UiLanguage, key: CopyKey): string {
  return copy[language][key] ?? copy.en[key];
}
