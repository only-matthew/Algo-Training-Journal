#include <iostream>
#include <algorithm>
#include <cstdio>
using namespace std;

typedef long long ll;

double w0, w;
int m;

double check(double rate)
{
    double remain = w0;

    for (int i = 1; i <= m; i++)
        remain = remain * (1 + rate) - w;

    return remain;
}

int main()
{
    cin >> w0 >> w >> m;

    double l = 0.0, r = 3.0;

    while (r - l > 1e-8)
    {
        double mid = (l + r) / 2;

        if (check(mid) > 0)
            r = mid;       // 利率太高
        else
            l = mid;       // 利率太低
    }

    printf("%.1f\n", l * 100);

    return 0;
}