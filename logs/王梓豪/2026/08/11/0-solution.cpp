#include <bits/stdc++.h>
using namespace std;
double a, b, c, d;
double value(double x)
{
    return a * x * x * x + b * x * x + c * x + d;
}
void solve(double i, double i1)
{
    if (value(i) == 0)
    {
        if (fabs(i)< 0.0005)
            i = 0;//防止输出-0，虽然好像这里没有输出-0的风险
        cout << fixed << setprecision(2) << i << ' ';
        return;
    }
    double l = i, r = i1;
    double lv = value(l);
    while (r - l > 1e-7)//循环代替递归
    {
        double x = (l + r) / 2.0;
        double temp = value(x);
        if (temp == 0)
        {
            if (fabs(x) < 0.0005)
                x = 0;
            cout << fixed << setprecision(2) << x << ' ';
            return;
        }
        if ((lv < 0 && temp > 0) || (lv > 0 && temp < 0))
        {
            r = x;
        }
        else
        {
            l = x;
            lv = temp;
        }
    }
    double x = (l + r) / 2.0;
    if (fabs(x) < 0.0005)
        x = 0;
    cout << fixed << setprecision(2) << x << ' ';
}

int main()
{
    cin >> a >> b >> c >> d;
    double v[201];
    for (int i = 0; i < 201; i++)
    {
        double x = i - 100.0;
        v[i] = value(x);
    }
    vector<double> q;
    for (int i = 0; i < 200; i++)
    {
        if (v[i] == 0)
        {
            q.push_back(i - 100.0);
        }
        else if ((v[i] < 0 && v[i + 1] > 0) ||
                 (v[i] > 0 && v[i + 1] < 0))
        {
            q.push_back(i - 100.0);
        }
    }
    if (v[200] == 0)
    {
        q.push_back(100.0);
    }
    for (int i = 0; i < q.size(); i++)
    {
        solve(q[i], q[i] + 1.0);
    }
    return 0;
}