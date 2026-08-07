#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    cin >> s;
    long long x = 0;
    long long c = 0;
    char bianliang = 'a';
    int side = 1;
    int i = 0;
    while (i < (int)s.size()) {
        if (s[i] == '=') {
            side = -1;
            i++;
            continue;
        }
        int sign = 1;
        if (s[i] == '+') {
            sign = 1;
            i++;
        } else if (s[i] == '-') {
            sign = -1;
            i++;
        }
        long long num = 0;
        bool if_num = false;
        while (i<(int)s.size()&&isdigit(s[i])) {
            num = num * 10 + (s[i] - '0');
            if_num = true;
            i++;
        }
        if (i < (int)s.size()&&islower(s[i])) {
            bianliang = s[i];
            i++;
            if (!if_num) {
                num = 1;
            }
            x += side * sign * num;
        } else {
            c += side * sign * num;
        }
    }
    double answer = -(double)c / x;
    cout<<bianliang<<'='<<fixed<<setprecision(3)<<answer<<endl;
    return 0;
}