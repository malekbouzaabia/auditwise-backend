import sys, json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

def generate_radar(input_file, output_path):
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    labels = [d['label'][:15] for d in data]
    values = [d['score'] for d in data]
    N = len(labels)
    
    angles = np.linspace(0, 2*np.pi, N, endpoint=False).tolist()
    values_plot = values + [values[0]]
    angles += angles[:1]
    
    fig, ax = plt.subplots(figsize=(7, 7), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor('#f0f6ff')
    ax.set_facecolor('#f0f6ff')
    ax.set_ylim(0, 100)
    ax.set_yticks([20, 40, 60, 80, 100])
    ax.set_yticklabels(['20%','40%','60%','80%','100%'], fontsize=7, color='#6b8cba')
    ax.grid(color='#d0e3f8', linewidth=0.8, linestyle='--', alpha=0.7)
    ax.spines['polar'].set_color('#d0e3f8')
    
    theta = np.linspace(0, 2*np.pi, 300)
    ax.fill_between(theta, 0, 40,   color='#fef2f2', alpha=0.4)
    ax.fill_between(theta, 40, 70,  color='#fffbeb', alpha=0.4)
    ax.fill_between(theta, 70, 100, color='#f0fdf4', alpha=0.4)
    
    ax.plot(angles, values_plot, 'o-', linewidth=2.5, color='#1b6fd8', markersize=6, zorder=5)
    ax.fill(angles, values_plot, alpha=0.25, color='#1b6fd8')
    
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=7.5, fontweight='bold', color='#0b1f45')
    
    for angle, value in zip(angles[:-1], values):
        col = '#22c55e' if value >= 70 else '#f59e0b' if value >= 40 else '#ef4444'
        ax.annotate(f'{value}%', xy=(angle, value), fontsize=7, fontweight='bold',
                   color=col, ha='center', va='bottom', xytext=(0, 8), textcoords='offset points')
    
    patches = [
        mpatches.Patch(color='#f0fdf4', label='Conforme >= 70%'),
        mpatches.Patch(color='#fffbeb', label='Partiel 40-70%'),
        mpatches.Patch(color='#fef2f2', label='Non-conforme < 40%'),
    ]
    ax.legend(handles=patches, loc='upper right', bbox_to_anchor=(1.38, 1.18), fontsize=7.5, framealpha=0.9)
    ax.set_title('Radar de Conformite ISO 27001:2022', fontsize=12, fontweight='bold', color='#0b1f45', pad=18)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='#f0f6ff', edgecolor='none')
    plt.close()
    print("OK")

generate_radar(sys.argv[1], sys.argv[2])