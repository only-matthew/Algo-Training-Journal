#include <bits/stdc++.h>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int t;
    cin>>t;
    while(t--)
    {
    int n,m;
    cin>>n>>m;
    vector<int> a(n);
    vector<int> b(m);
    for(int i=0;i<n;i++)
    {
        cin>>a[i];
    }
    for(int i=0;i<m;i++)
    {
        cin>>b[i];
    }
    sort(a.begin(),a.end());
    sort(b.begin(),b.end());
    // vector<int> big(m,-1);
    // vector<int> small(n,-1);
    // int equal=0;
    // int last=0;
    
        bool ok = true;
        if (n < 2 * m) {
            ok = false;
        }
        for (int i = 0; i < m; ++i) {
            int small = lower_bound(a.begin(), a.end(), b[i]) - a.begin();
            int big = n - small;
            if (small <= i || big <= m - i - 1) {
                ok = false;
                break;
            }
        }
        if(ok) {
            cout << "YES" << endl;
        } else {
            cout << "NO" << endl;
        }
    }

    return 0;
    // for(int i=0;i<m;i++)
    // {int idx=0;
    //     for(int j=last;j<n;j++)
    //     {
    //         if(a[j]==b[i])
    //         equal++;
    //         if(a[j]>=b[i])
    //         {idx=j;last=j;break;}
    //     }
    //     big[i]=n-idx;
    //     small[i]=idx;
//     // }
//     if(m<=0)
//     {
//         cout<<"YES"<<endl;
//         continue;
//     }
//     if((n-equal)<2*(m-equal))
//     {
//         cout<<"NO"<<endl;
//         continue;
//     }
//     bool flag=1;
//     for(int i=0;i<m;i++)
//     {
//         if(small[i]>i&&big[i]>m-i-1)
//         {}
//         else
//         {
//             cout<<"NO"<<endl;
//             flag=0;
//             break;
//         }
//     }
//     if(flag)
//     {
//         cout<<"YES"<<endl;
//     }
// }
}