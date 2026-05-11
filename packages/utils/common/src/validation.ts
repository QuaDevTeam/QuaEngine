export function isEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isUrl(url: string): boolean {
  return URL.canParse(url)
}

export function isPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]{10,}$/
  return phoneRegex.test(phone.replace(/\s/g, ''))
}

export function isStrongPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  return strongPasswordRegex.test(password)
}

export function isCreditCard(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\s/g, '')

  // Check if all characters are digits and length is appropriate
  if (!/^\d{13,19}$/.test(cleaned))
    return false

  // Luhn algorithm
  let sum = 0
  let shouldDouble = false

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = Number.parseInt(cleaned.charAt(i), 10)

    if (shouldDouble) {
      digit *= 2
      if (digit > 9)
        digit -= 9
    }

    sum += digit
    shouldDouble = !shouldDouble
  }

  return sum % 10 === 0
}

export function isIPAddress(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/
  const ipv6Regex = /^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i

  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

export function isUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

export function isHexColor(color: string): boolean {
  const hexColorRegex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
  return hexColorRegex.test(color)
}

export function isJSON(str: string): boolean {
  try {
    JSON.parse(str)
    return true
  }
  catch {
    return false
  }
}

export function isAlphanumeric(str: string): boolean {
  const alphanumericRegex = /^[a-z0-9]+$/i
  return alphanumericRegex.test(str)
}

export function isNumeric(str: string): boolean {
  return !Number.isNaN(Number(str)) && !Number.isNaN(Number.parseFloat(str))
}

export function isAlpha(str: string): boolean {
  const alphaRegex = /^[a-z]+$/i
  return alphaRegex.test(str)
}

export function isSlug(str: string): boolean {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  return slugRegex.test(str)
}

export function isMACAddress(mac: string): boolean {
  const macRegex = /^(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i
  return macRegex.test(mac)
}

export function isBase64(str: string): boolean {
  try {
    return btoa(atob(str)) === str
  }
  catch {
    return false
  }
}

export function validateRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

export function validateLength(str: string, min: number, max?: number): boolean {
  if (!max)
    return str.length >= min
  return str.length >= min && str.length <= max
}
