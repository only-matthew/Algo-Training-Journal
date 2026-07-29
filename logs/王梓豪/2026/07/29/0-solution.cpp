#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    double S, C, L, P0;
    cin >> S >> C >> L >> P0 >> n;

    if (n == 0) {
    double maxDis = C * L;
    if (S - maxDis > 1e-9) {
        cout << "No Solution" << endl;
    } else {
        cout << fixed << setprecision(2) << S / L * P0 + 1e-9 << endl;
    }
    return 0;
}

    vector<double> d(n + 2), p(n + 2);
    d[0] = 0; p[0] = P0;         
    for (int i = 1; i <= n; i++) {
        cin >> d[i] >> p[i];    
    }
    d[n + 1] = S; p[n + 1] = 0;  

    double maxDis = C * L;
    double oil = 0, ans = 0; 
    int i = 0;               

    while (i < n + 1) {
        if (d[i + 1] - d[i] > maxDis) {
            cout << "No Solution" << endl;
            return 0;
        }

        int min_n = -1;
        int max_n = i + 1; 
        double minPrice = p[i];
        for (int j = i + 1; j <= n + 1 && d[j] - d[i] <= maxDis; j++) {
            if (p[j] < minPrice) {
                min_n = j;
                break;
            }
            max_n = j;
        }

        if (min_n == -1) {
            int best = i + 1;
            for (int j = i + 1; j <= n + 1 && d[j] - d[i] <= maxDis; j++) {
                if (p[j] < p[best]) best = j;
            }
            ans += (C - oil) * p[i];
            oil = C;
            oil -= (d[best] - d[i]) / L;
            i = best;
        } else {
            double need = (d[min_n] - d[i]) / L - oil;
            if (need > 0) {
                ans += need * p[i];
                oil += need;
            }
            oil -= (d[min_n] - d[i]) / L;
            i = min_n;
        }
    }

    cout << fixed << setprecision(2) << ans << endl;
    return 0;
}