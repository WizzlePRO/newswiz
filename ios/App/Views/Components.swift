import SwiftUI

/// Five-step lean scale with the outlet's position lit, plus a label. Describes the outlet, not the article.
struct LeanChip: View {
    var lean: String
    var overridden = false

    var body: some View {
        HStack(spacing: 4) {
            HStack(spacing: 1) {
                ForEach(0..<5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Lean.step(lean) == i ? Lean.color(lean) : Color.secondary.opacity(0.25))
                        .frame(width: 4, height: 9)
                }
            }
            Text(Lean.label(lean) + (overridden ? " (yours)" : ""))
        }
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color.secondary.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Outlet lean: \(Lean.label(lean))")
    }
}

struct AccessBadge: View {
    var access: String

    private var info: (String, Color) {
        switch access {
        case "free": return ("Free", .green)
        case "registration": return ("Free w/ account", .mint)
        case "mixed": return ("Mostly free", .mint)
        case "metered": return ("Metered", .orange)
        case "paywalled": return ("Paywalled", .red)
        default: return ("Unverified", .gray)
        }
    }

    var body: some View {
        let (label, color) = info
        Text(label)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: Capsule())
    }
}

/// Left / center / right / unrated as one stacked bar.
struct BalanceBar: View {
    var left: Int
    var center: Int
    var right: Int
    var unrated: Int
    var height: CGFloat = 10

    var body: some View {
        let total = max(1, left + center + right + unrated)
        GeometryReader { geo in
            HStack(spacing: 0) {
                segment(left, Lean.color("left"), total, geo.size.width)
                segment(center, Lean.color("center"), total, geo.size.width)
                segment(right, Lean.color("right"), total, geo.size.width)
                segment(unrated, .gray, total, geo.size.width)
            }
        }
        .frame(height: height)
        .clipShape(Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Left \(left), center \(center), right \(right), unrated \(unrated)")
    }

    private func segment(_ n: Int, _ color: Color, _ total: Int, _ width: CGFloat) -> some View {
        color.frame(width: width * CGFloat(n) / CGFloat(total))
    }
}

extension Date {
    var shortAgo: String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: self, relativeTo: .now)
    }
}
