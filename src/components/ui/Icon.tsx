/**
 * Central icon registry — the ONE place the icon set is defined.
 *
 * Why this exists:
 *  - Authentic identity: Phosphor (stroke-based, engineering feel) instead of
 *    the ubiquitous Font Awesome, so FixMaster doesn't look like every other app.
 *  - Swappable: change the whole app's iconography by editing this file alone.
 *  - Runtime lookup: nav config stores icon names as strings, so we map by name.
 *
 * Usage:
 *   <Icon name="plus" />
 *   <Icon name="trash" weight="bold" className={styles.x} />
 *
 * Names intentionally mirror the old Font Awesome suffixes (without "fa-")
 * so the migration is mechanical and call sites stay readable.
 */
import {
  Plus,
  Minus,
  Trash,
  Wrench,
  PencilSimple,
  Users,
  MagnifyingGlass,
  WhatsappLogo,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowsLeftRight,
  ArrowSquareOut,
  ArrowUUpLeft,
  Check,
  CheckCircle,
  Checks,
  Tray,
  Storefront,
  Link as LinkIcon,
  Receipt,
  ListChecks,
  SquaresFour,
  Rows,
  GridNine,
  Trophy,
  Printer,
  Cpu,
  QrCode,
  Stack,
  Info,
  Wallet,
  Bell,
  CircleNotch,
  SignOut,
  SignIn,
  User,
  UserCircle,
  ChartLine,
  ChartPie,
  Coins,
  ClipboardText,
  Spinner,
  List,
  Truck,
  Package,
  Repeat,
  CaretDoubleLeft,
  CaretDown,
  FileText,
  Question,
  Warning,
  WarningCircle,
  Crown,
  Calendar,
  CalendarCheck,
  CalendarBlank,
  DownloadSimple,
  X,
  ClockCounterClockwise,
  Clock,
  Target,
  TrendUp,
  TrendDown,
  Scales,
  CashRegister,
  ShoppingCart,
  Gauge,
  Gear,
  Tag,
  Path as PathIcon,
  Cardholder,
  Pulse,
  WaveSine,
  Lightning,
  Funnel,
  Phone,
  EnvelopeSimple,
  MapPin,
  Sun,
  Moon,
  XCircle,
  ShieldCheck,
  SlidersHorizontal,
  Eye,
  EyeSlash,
  type IconProps as PhosphorIconProps,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';

export type IconName =
  | 'plus'
  | 'minus'
  | 'trash'
  | 'screwdriver-wrench'
  | 'wrench'
  | 'pen'
  | 'users'
  | 'magnifying-glass'
  | 'whatsapp'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right-arrow-left'
  | 'up-right-from-square'
  | 'check'
  | 'circle-check'
  | 'check-circle'
  | 'check-double'
  | 'inbox'
  | 'shop'
  | 'store'
  | 'link'
  | 'receipt'
  | 'list-check'
  | 'view-cards'
  | 'view-list'
  | 'view-tiles'
  | 'trophy'
  | 'print'
  | 'microchip'
  | 'qrcode'
  | 'boxes-stacked'
  | 'box-open'
  | 'box'
  | 'info-circle'
  | 'wallet'
  | 'bell'
  | 'circle-notch'
  | 'right-from-bracket'
  | 'right-to-bracket'
  | 'user'
  | 'user-clock'
  | 'chart-line'
  | 'chart-pie'
  | 'coins'
  | 'clipboard-list'
  | 'spinner'
  | 'bars'
  | 'truck-field'
  | 'repeat'
  | 'angles-left'
  | 'chevron-down'
  | 'file-invoice'
  | 'circle-question'
  | 'triangle-exclamation'
  | 'crown'
  | 'calendar'
  | 'calendar-check'
  | 'calendar-alt'
  | 'download'
  | 'times'
  | 'clock-rotate-left'
  | 'clock'
  | 'bullseye'
  | 'arrow-trend-up'
  | 'arrow-trend-down'
  | 'scale-balanced'
  | 'cash-register'
  | 'cart-shopping'
  | 'gauge'
  | 'gear'
  | 'tag'
  | 'cardholder'
  | 'pulse'
  | 'wave'
  | 'lightning'
  | 'filter'
  | 'phone'
  | 'envelope'
  | 'map-pin'
  | 'sun'
  | 'moon'
  | 'circle-xmark'
  | 'circle-info'
  | 'shield-halved'
  | 'sliders'
  | 'eye'
  | 'eye-slash';

/** Name → Phosphor component. Aliases collapse onto shared glyphs. */
const REGISTRY: Record<IconName, PhosphorIcon> = {
  plus: Plus,
  minus: Minus,
  trash: Trash,
  'screwdriver-wrench': Wrench,
  wrench: Wrench,
  pen: PencilSimple,
  users: Users,
  'magnifying-glass': MagnifyingGlass,
  whatsapp: WhatsappLogo,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'arrow-right-arrow-left': ArrowsLeftRight,
  'up-right-from-square': ArrowSquareOut,
  check: Check,
  'circle-check': CheckCircle,
  'check-circle': CheckCircle,
  'check-double': Checks,
  inbox: Tray,
  shop: Storefront,
  store: Storefront,
  link: LinkIcon,
  receipt: Receipt,
  'list-check': ListChecks,
  'view-cards': SquaresFour,
  'view-list': Rows,
  'view-tiles': GridNine,
  trophy: Trophy,
  print: Printer,
  microchip: Cpu,
  qrcode: QrCode,
  'boxes-stacked': Stack,
  'box-open': Package,
  box: Package,
  'info-circle': Info,
  wallet: Wallet,
  bell: Bell,
  'circle-notch': CircleNotch,
  'right-from-bracket': SignOut,
  'right-to-bracket': SignIn,
  user: User,
  'user-clock': UserCircle,
  'chart-line': ChartLine,
  'chart-pie': ChartPie,
  coins: Coins,
  'clipboard-list': ClipboardText,
  spinner: Spinner,
  bars: List,
  'truck-field': Truck,
  repeat: Repeat,
  'angles-left': CaretDoubleLeft,
  'chevron-down': CaretDown,
  'file-invoice': FileText,
  'circle-question': Question,
  'triangle-exclamation': Warning,
  crown: Crown,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  'calendar-alt': CalendarBlank,
  download: DownloadSimple,
  times: X,
  'clock-rotate-left': ClockCounterClockwise,
  clock: Clock,
  bullseye: Target,
  'arrow-trend-up': TrendUp,
  'arrow-trend-down': TrendDown,
  'scale-balanced': Scales,
  'cash-register': CashRegister,
  'cart-shopping': ShoppingCart,
  gauge: Gauge,
  gear: Gear,
  tag: Tag,
  cardholder: Cardholder,
  pulse: Pulse,
  wave: WaveSine,
  lightning: Lightning,
  filter: Funnel,
  phone: Phone,
  envelope: EnvelopeSimple,
  'map-pin': MapPin,
  sun: Sun,
  moon: Moon,
  'circle-xmark': XCircle,
  'circle-info': Info,
  'shield-halved': ShieldCheck,
  sliders: SlidersHorizontal,
  eye: Eye,
  'eye-slash': EyeSlash,
};

// Reference rarely-used imports so tree-shaking keeps them and lint stays happy.
void [PathIcon, WarningCircle, ArrowUUpLeft];

export interface IconProps extends Omit<PhosphorIconProps, 'ref'> {
  name: IconName | string;
}

/**
 * Normalize a possibly-legacy icon name to a registry key.
 * Accepts 'plus', 'fa-plus', 'fas fa-plus', 'fab fa-whatsapp' → 'plus'/'whatsapp'.
 * This lets dynamic config strings (nav, settings, dashboard alerts) keep their
 * existing 'fa-*' values without a sweeping rewrite.
 */
function normalize(name: string): IconName {
  const token = name.trim().split(/\s+/).pop() ?? name;
  return token.replace(/^fa-/, '') as IconName;
}

/**
 * Render a registered icon by name. Unknown names fall back to a question
 * mark (visible-but-safe) so a typo never crashes the UI.
 */
export function Icon({ name, weight = 'regular', size, ...rest }: IconProps) {
  const Cmp = REGISTRY[normalize(name)] ?? Question;
  return <Cmp weight={weight} size={size ?? '1em'} {...rest} />;
}
