/**
 * Bảng màu "bếp": xanh lá húng quế làm màu chính, vàng nghệ cho nhãn Quick,
 * nền xám-xanh rất nhạt để ảnh món ăn nổi bật.
 */
export const colors = {
  basil: '#2F6B4F',
  basilDark: '#1E4A36',
  basilTint: '#E4EFE8',
  saffron: '#B7791F',
  saffronTint: '#FBF0DA',
  ink: '#1D2721',
  muted: '#66736B',
  line: '#DCE3DE',
  bg: '#F3F6F4',
  surface: '#FFFFFF',
  danger: '#B42318',
  dangerTint: '#FDECEA',
  slate: '#55606A',
  slateTint: '#ECEFF2',
  sky: '#1F5F8B',
  skyTint: '#E3EEF6',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.ink },
  price: { fontSize: 17, fontWeight: '800' as const, color: colors.basilDark, fontVariant: ['tabular-nums' as const] },
};
