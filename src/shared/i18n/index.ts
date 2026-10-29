import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hi from './hi.json'

const saved = localStorage.getItem('lang')

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: saved === 'en' || saved === 'hi' ? saved : 'hi',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

// Keep <html lang> in sync so screen readers and the Devanagari font switch with the UI.
i18n.on('languageChanged', (l) => { document.documentElement.lang = l })
document.documentElement.lang = i18n.language

export const setLanguage = (lang: 'en' | 'hi') => {
  localStorage.setItem('lang', lang)
  void i18n.changeLanguage(lang)
}

export default i18n
